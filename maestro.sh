#!/bin/bash

# Load configuration
if [ -f maestro.env ]; then
    set -a
    source maestro.env
    set +a
else
    echo "Fatal Error: maestro.env configuration file not found."
    echo "Please create maestro.env with your configuration settings."
    exit 1
fi

FULL_REPO_PATH="$GITHUB_USERNAME/$REPOSITORY_NAME"

echo "Step 1: Creating Codespace for $FULL_REPO_PATH"
# The --json and --jq flags extract only the raw Codespace ID string
CODESPACE_ID=$(gh codespace create --repo $FULL_REPO_PATH --branch $BRANCH --machine $MACHINE_TYPE --json name --jq .name)

if [ -z "$CODESPACE_ID" ]; then
    echo "Fatal Error: Codespace creation failed."
    exit 1
fi

echo "Success: Codespace ID is $CODESPACE_ID"

echo "Step 2: Executing Node.js recording script..."
# Run the npm script defined in package.json which includes xvfb-run
gh codespace ssh --codespace $CODESPACE_ID -- "npm run record"

echo "Step 3: Downloading the MP4 artifact..."
# Securely copy the output.mp4 file to the local directory
gh codespace cp remote:/workspaces/$REPOSITORY_NAME/output.mp4 ./demo-recording.mp4 --codespace $CODESPACE_ID

echo "Step 4: Deleting Codespace..."
# Delete the codespace to prevent quota consumption
gh codespace delete --codespace $CODESPACE_ID

echo "Process finished. The file 'demo-recording.mp4' is now available locally."
