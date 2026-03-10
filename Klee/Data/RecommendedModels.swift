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
            id: "mlx-community/gemma-3-4b-it-qat-4bit",
            name: "Gemma 3 4B",
            size: "~3 GB",
            minRAM: 8,
            expectedBytes: 3_000_000_000
        ),
        ModelInfo(
            id: "mlx-community/Qwen3-4B-4bit",
            name: "Qwen3 4B",
            size: "~2.5 GB",
            minRAM: 8,
            expectedBytes: 2_500_000_000
        ),
        ModelInfo(
            id: "mlx-community/Phi-4-mini-instruct-4bit",
            name: "Phi 4 Mini",
            size: "~2.2 GB",
            minRAM: 8,
            expectedBytes: 2_200_000_000
        ),

        // 16GB devices
        ModelInfo(
            id: "mlx-community/Qwen3-8B-4bit",
            name: "Qwen3 8B",
            size: "~5 GB",
            minRAM: 16,
            expectedBytes: 5_000_000_000
        ),
        ModelInfo(
            id: "mlx-community/gemma-3-12b-it-qat-4bit",
            name: "Gemma 3 12B",
            size: "~8 GB",
            minRAM: 16,
            expectedBytes: 8_000_000_000
        ),
        ModelInfo(
            id: "mlx-community/DeepSeek-R1-0528-Qwen3-8B-4bit",
            name: "DeepSeek R1 8B",
            size: "~4.6 GB",
            minRAM: 16,
            expectedBytes: 4_600_000_000
        ),

        // 32GB devices
        ModelInfo(
            id: "mlx-community/Qwen3-14B-4bit",
            name: "Qwen3 14B",
            size: "~8 GB",
            minRAM: 32,
            expectedBytes: 8_000_000_000
        ),
        ModelInfo(
            id: "mlx-community/Qwen3-30B-A3B-4bit",
            name: "Qwen3 30B (MoE)",
            size: "~17 GB",
            minRAM: 32,
            expectedBytes: 17_200_000_000
        ),

        // 64GB+ devices
        ModelInfo(
            id: "mlx-community/gemma-3-27b-it-qat-4bit",
            name: "Gemma 3 27B",
            size: "~17 GB",
            minRAM: 64,
            expectedBytes: 17_000_000_000
        ),
        ModelInfo(
            id: "mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit",
            name: "DeepSeek R1 32B",
            size: "~18 GB",
            minRAM: 64,
            expectedBytes: 18_400_000_000
        ),
    ]
}
