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

        // 16GB devices (minimum for MCP tool calling)
        ModelInfo(
            id: "mlx-community/Qwen3.5-9B-4bit",
            name: "Qwen3.5 9B",
            size: "~6 GB",
            minRAM: 16,
            expectedBytes: 5_600_000_000
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
            id: "mlx-community/Qwen3.5-35B-A3B-4bit",
            name: "Qwen3.5 35B (MoE)",
            size: "~18 GB",
            minRAM: 32,
            expectedBytes: 18_000_000_000
        ),

        // 64GB+ devices
        ModelInfo(
            id: "mlx-community/Qwen3.5-27B-4bit",
            name: "Qwen3.5 27B",
            size: "~16 GB",
            minRAM: 64,
            expectedBytes: 16_000_000_000
        ),
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

        // 256GB+ devices
        ModelInfo(
            id: "mlx-community/Qwen3.5-397B-A17B-4bit",
            name: "Qwen3.5 397B (MoE)",
            size: "~200 GB",
            minRAM: 256,
            expectedBytes: 200_000_000_000
        ),

        // 512GB+ devices
        ModelInfo(
            id: "mlx-community/GLM-5-4bit",
            name: "GLM-5 744B (MoE)",
            size: "~419 GB",
            minRAM: 512,
            expectedBytes: 419_000_000_000
        ),

        // 768GB+ devices (future hardware)
        ModelInfo(
            id: "mlx-community/Kimi-K2.5",
            name: "Kimi K2.5 1T (MoE)",
            size: "~658 GB",
            minRAM: 768,
            expectedBytes: 658_000_000_000
        ),
    ]
}
