//
//  MarkdownTextView.swift
//  Klee
//
//  Custom Markdown rendering view for common LLM output formats.
//  Supports headings, bold, italic, inline code, code blocks, lists, dividers, etc.
//  macOS-specific, uses NSColor.
//

import SwiftUI

// MARK: - MarkdownTextView

struct MarkdownTextView: View {
    let text: String

    var body: some View {
        if text.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(parseBlocks().enumerated()), id: \.offset) { _, block in
                    blockView(for: block)
                }
            }
        }
    }

    // MARK: - Render Block Types

    @ViewBuilder
    private func blockView(for block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let content):
            headingView(level: level, content: content)

        case .codeBlock(let language, let code):
            codeBlockView(language: language, code: code)

        case .divider:
            Divider()
                .padding(.vertical, 4)

        case .listItem(let content):
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\u{2022}")
                    .foregroundStyle(.secondary)
                inlineMarkdownText(content)
            }
            .padding(.leading, 12)

        case .paragraph(let content):
            inlineMarkdownText(content)
        }
    }

    // MARK: - Heading Rendering

    private func headingView(level: Int, content: String) -> some View {
        let font: Font = switch level {
        case 1: .title.bold()
        case 2: .title2.bold()
        case 3: .title3.bold()
        default: .headline.bold()
        }
        return inlineMarkdownText(content)
            .font(font)
            .padding(.top, level <= 2 ? 6 : 2)
    }

    // MARK: - Code Block Rendering

    private func codeBlockView(language: String, code: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Language label
            if !language.isEmpty {
                Text(language)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.top, 6)
                    .padding(.bottom, 2)
            }
            // Code content
            ScrollView(.horizontal, showsIndicators: false) {
                Text(code)
                    .font(.system(.body, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(10)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(Color(nsColor: .separatorColor).opacity(0.5), lineWidth: 0.5)
        )
    }

    // MARK: - Inline Markdown Text (bold, italic, inline code)

    private func inlineMarkdownText(_ text: String) -> Text {
        // Parse inline Markdown using AttributedString's inlineOnlyPreservingWhitespace
        if let attributed = try? AttributedString(
            markdown: text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        ) {
            return Text(attributed)
        }
        return Text(text)
    }

    // MARK: - Parse Markdown into Block List

    private func parseBlocks() -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        let lines = text.components(separatedBy: "\n")
        var i = 0

        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            // Code block: starts with ```
            if trimmed.hasPrefix("```") {
                let language = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                var codeLines: [String] = []
                i += 1
                while i < lines.count {
                    let codeLine = lines[i]
                    if codeLine.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                        i += 1
                        break
                    }
                    codeLines.append(codeLine)
                    i += 1
                }
                blocks.append(.codeBlock(language: language, code: codeLines.joined(separator: "\n")))
                continue
            }

            // Divider: ---, ***, ___ (single line, at least 3 characters)
            if isDivider(trimmed) {
                blocks.append(.divider)
                i += 1
                continue
            }

            // Heading: # ## ### ####
            if let (level, content) = parseHeading(trimmed) {
                blocks.append(.heading(level: level, content: content))
                i += 1
                continue
            }

            // Unordered list: starts with - or * or + (followed by space)
            if let content = parseUnorderedListItem(trimmed) {
                blocks.append(.listItem(content: content))
                i += 1
                continue
            }

            // Ordered list: 1. 2. etc.
            if let content = parseOrderedListItem(trimmed) {
                blocks.append(.listItem(content: content))
                i += 1
                continue
            }

            // Skip empty lines
            if trimmed.isEmpty {
                i += 1
                continue
            }

            // Regular paragraph: merge consecutive non-empty lines
            var paragraphLines: [String] = [line]
            i += 1
            while i < lines.count {
                let nextLine = lines[i]
                let nextTrimmed = nextLine.trimmingCharacters(in: .whitespaces)
                // End paragraph when encountering empty line, heading, list, code block, or divider
                if nextTrimmed.isEmpty ||
                    parseHeading(nextTrimmed) != nil ||
                    nextTrimmed.hasPrefix("```") ||
                    parseUnorderedListItem(nextTrimmed) != nil ||
                    parseOrderedListItem(nextTrimmed) != nil ||
                    isDivider(nextTrimmed) {
                    break
                }
                paragraphLines.append(nextLine)
                i += 1
            }
            blocks.append(.paragraph(content: paragraphLines.joined(separator: "\n")))
        }

        return blocks
    }

    // MARK: - Parsing Helpers

    /// Parse heading line: # ~ ####, returns (level, content)
    private func parseHeading(_ line: String) -> (Int, String)? {
        var level = 0
        var idx = line.startIndex
        while idx < line.endIndex && line[idx] == "#" && level < 4 {
            level += 1
            idx = line.index(after: idx)
        }
        guard level > 0, idx < line.endIndex, line[idx] == " " else { return nil }
        let content = String(line[line.index(after: idx)...]).trimmingCharacters(in: .whitespaces)
        guard !content.isEmpty else { return nil }
        return (level, content)
    }

    /// Parse unordered list item: starts with - / * / + followed by space
    private func parseUnorderedListItem(_ line: String) -> String? {
        guard let first = line.first, "-*+".contains(first),
              line.count >= 2,
              line[line.index(after: line.startIndex)] == " " else { return nil }
        let content = String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
        return content.isEmpty ? nil : content
    }

    /// Parse ordered list item: number. followed by space
    private func parseOrderedListItem(_ line: String) -> String? {
        guard let dotIndex = line.firstIndex(of: ".") else { return nil }
        let prefix = line[line.startIndex..<dotIndex]
        guard !prefix.isEmpty, prefix.allSatisfy(\.isNumber) else { return nil }
        let afterDot = line.index(after: dotIndex)
        guard afterDot < line.endIndex, line[afterDot] == " " else { return nil }
        let content = String(line[line.index(after: afterDot)...]).trimmingCharacters(in: .whitespaces)
        return content.isEmpty ? nil : content
    }

    /// Check if line is a divider
    private func isDivider(_ line: String) -> Bool {
        guard line.count >= 3 else { return false }
        return line.allSatisfy({ $0 == "-" }) ||
               line.allSatisfy({ $0 == "*" }) ||
               line.allSatisfy({ $0 == "_" })
    }
}

// MARK: - Markdown Block Types

private enum MarkdownBlock {
    case heading(level: Int, content: String)
    case codeBlock(language: String, code: String)
    case divider
    case listItem(content: String)
    case paragraph(content: String)
}

// MARK: - Preview

#Preview {
    ScrollView {
        MarkdownTextView(text: """
        # Title 1
        ## Title 2
        ### Title 3

        This is a paragraph with **bold** and *italic* text.

        Here is `inline code` in a sentence.

        ```swift
        func hello() {
            print("Hello, world!")
        }
        ```

        - First item
        - Second item with **bold**
        - Third item

        1. Ordered item one
        2. Ordered item two

        ---

        Another paragraph after the divider.
        """)
        .padding()
    }
    .frame(width: 500, height: 600)
}
