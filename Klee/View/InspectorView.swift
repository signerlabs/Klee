//
//  InspectorView.swift
//  Klee
//
//  Right-side inspector panel showing thinking processes and tool call history
//  for the current conversation. Displayed via .inspector() modifier on ChatView.
//

import SwiftUI

struct InspectorView: View {
    let items: [InspectorItem]

    var body: some View {
        Group {
            if items.isEmpty {
                ContentUnavailableView(
                    "No Activity Yet",
                    systemImage: "text.magnifyingglass",
                    description: Text("Thinking processes and tool calls will appear here.")
                )
            } else {
                itemList
                    .padding(.vertical, 30)
            }
        }
    }

    // MARK: - Item List

    private var itemList: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(items) { item in
                    InspectorItemRow(item: item)
                        .id(item.id)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                }

                // Invisible bottom anchor for reliable scrolling
                Color.clear
                    .frame(height: 1)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                    .id("inspector-bottom")
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .onChange(of: items) {
                // Fires on count AND content changes (InspectorItem is Equatable)
                withAnimation(.easeOut(duration: 0.15)) {
                    proxy.scrollTo("inspector-bottom", anchor: .bottom)
                }
            }
        }
    }
}

// MARK: - Inspector Item Row

private struct InspectorItemRow: View {
    let item: InspectorItem
    @State private var isExpanded = true

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Header: toggle button
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    itemIcon
                    itemLabel
                        .font(.callout)
                        .fontWeight(.medium)
                    Spacer()
                    // Timestamp
                    Text(item.timestamp, format: .dateTime.hour().minute().second())
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .monospacedDigit()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .imageScale(.small)
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(.plain)

            // Expandable content
            if isExpanded {
                itemDetail
                    .padding(.leading, 22)
            }
        }
        .padding(8)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Icon

    @ViewBuilder
    private var itemIcon: some View {
        switch item.content {
        case .thinking:
            Image(systemName: "brain")
                .foregroundStyle(.purple)
        case .toolCall(_, _, let status):
            switch status {
            case .calling:
                ProgressView()
                    .controlSize(.small)
                    .frame(width: 16, height: 16)
            case .completed:
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            case .failed:
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.red)
            }
        }
    }

    // MARK: - Label

    @ViewBuilder
    private var itemLabel: some View {
        switch item.content {
        case .thinking:
            Text("Thinking")
                .foregroundStyle(.secondary)
        case .toolCall(let name, _, _):
            Text(name)
                .fontDesign(.monospaced)
                .foregroundStyle(.primary)
        }
    }

    // MARK: - Detail Content

    @ViewBuilder
    private var itemDetail: some View {
        switch item.content {
        case .thinking(let text):
            Text(text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)

        case .toolCall(_, let arguments, let status):
            VStack(alignment: .leading, spacing: 4) {
                if !arguments.isEmpty {
                    Text("Arguments")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .textCase(.uppercase)
                    Text(arguments)
                        .font(.caption)
                        .fontDesign(.monospaced)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                switch status {
                case .calling:
                    HStack(spacing: 4) {
                        ProgressView()
                            .controlSize(.mini)
                        Text("Executing...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                case .completed(let result):
                    if !result.isEmpty {
                        Divider()
                        Text("Result")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .textCase(.uppercase)
                        Text(result)
                            .font(.caption)
                            .fontDesign(.monospaced)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                case .failed(let error):
                    Divider()
                    Text("Error")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .textCase(.uppercase)
                    Text(error)
                        .font(.caption)
                        .fontDesign(.monospaced)
                        .foregroundStyle(.red)
                        .textSelection(.enabled)
                }
            }
        }
    }
}
