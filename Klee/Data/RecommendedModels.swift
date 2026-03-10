//
//  RecommendedModels.swift
//  Klee
//
//  Predefined recommended model list, tiered by system RAM.
//  Add or modify models by editing this file only.
//

import Foundation

extension ModelInfo {

    /// Predefined recommended model list (tiered by RAM)
    /// expectedBytes is an estimated download size for progress bar calculation (does not need to be exact)
    static let recommended: [ModelInfo] = [

        // 8GB devices
        ModelInfo(
            id: "mlx-community/Qwen3-4B-4bit",
            name: "Qwen3 4B",
            size: "~2.5 GB",
            minRAM: 8,
            expectedBytes: 2_500_000_000
        ),

        // 16GB devices
        ModelInfo(
            id: "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit",
            name: "Llama 3.1 8B",
            size: "~4.5 GB",
            minRAM: 16,
            expectedBytes: 4_500_000_000
        ),
        ModelInfo(
            id: "mlx-community/Qwen3-8B-4bit",
            name: "Qwen3 8B",
            size: "~5 GB",
            minRAM: 16,
            expectedBytes: 5_000_000_000
        ),

        // 32GB devices
        ModelInfo(
            id: "mlx-community/Mistral-Small-24B-Instruct-2501-4bit",
            name: "Mistral Small 24B",
            size: "~12 GB",
            minRAM: 32,
            expectedBytes: 12_000_000_000
        ),
        ModelInfo(
            id: "mlx-community/Qwen3-14B-4bit",
            name: "Qwen3 14B",
            size: "~8 GB",
            minRAM: 32,
            expectedBytes: 8_000_000_000
        ),

        // 64GB+ devices
        ModelInfo(
            id: "mlx-community/Qwen3-32B-4bit",
            name: "Qwen3 32B",
            size: "~18 GB",
            minRAM: 64,
            expectedBytes: 18_000_000_000
        ),
    ]
}
