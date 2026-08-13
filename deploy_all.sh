#!/bin/bash

# List of your 4 model files (without the .pt extension)
MODELS=("Adaptor_best" "Capnut_best" "Pin_best" "Stud_best")

for MODEL in "${MODELS[@]}"; do
    echo "========================================"
    echo "🚀 Compiling $MODEL for Axelera Metis..."
    echo "========================================"

    # Automatically generate a temporary YAML file for this specific model
    cat <<EOF > temp_${MODEL}.yaml
name: ${MODEL}_pipeline
model:
  path: /home/ubuntu/voyager-sdk/WgDeepInsights/Wg-backend/surface_models/${MODEL}.pt
preprocess:
  - letterbox:
      width: 640
      height: 640
  - torch-totensor:
  - normalize:
      mean: [0.485, 0.456, 0.406]
      std: [0.229, 0.224, 0.225]
postprocess:
  - yolov8-detect:  # Change to yolov5-detect if you trained on YOLOv5!
      num_classes: 4
      confidence_threshold: 0.50
      iou_threshold: 0.45
EOF

    # Run the Axelera compiler using the generated YAML
    ./deploy.py temp_${MODEL}.yaml
done

echo "✅ All 4 models successfully compiled for the AIPU!"