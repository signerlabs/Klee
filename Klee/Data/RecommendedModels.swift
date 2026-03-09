//
//  RecommendedModels.swift
//  Klee
//
//  预定义的推荐模型列表，按系统内存分级。
//  新增/修改模型只需编辑此文件。
//

import Foundation

extension ModelInfo {

    /// 预定义推荐模型列表（按内存分级）
    static let recommended: [ModelInfo] = [

        // 8GB 机型
        ModelInfo(
            id: "mlx-community/Qwen3-4B-4bit",
            name: "Qwen3 4B",
            size: "~2.5 GB",
            minRAM: 8
        ),

        // 16GB 机型
        ModelInfo(
            id: "mlx-community/Llama-3.3-8B-Instruct-4bit",
            name: "Llama 3.3 8B",
            size: "~5 GB",
            minRAM: 16
        ),
        ModelInfo(
            id: "mlx-community/Qwen3-8B-4bit",
            name: "Qwen3 8B",
            size: "~5 GB",
            minRAM: 16
        ),

        // 32GB 机型
        ModelInfo(
            id: "mlx-community/Mistral-Small-24B-Instruct-2501-4bit",
            name: "Mistral Small 24B",
            size: "~12 GB",
            minRAM: 32
        ),
        ModelInfo(
            id: "mlx-community/Qwen3-14B-4bit",
            name: "Qwen3 14B",
            size: "~8 GB",
            minRAM: 32
        ),

        // 64GB+ 机型
        ModelInfo(
            id: "mlx-community/Qwen3-32B-4bit",
            name: "Qwen3 32B",
            size: "~18 GB",
            minRAM: 64
        ),
    ]
}
