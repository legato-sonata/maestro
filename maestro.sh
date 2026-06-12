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

# Determine target repository
if [ -n "$GITHUB_USERNAME" ] && [ -n "$REPOSITORY_NAME" ] && [ "$GITHUB_USERNAME" != "your-username" ]; then
    FULL_REPO_PATH="$GITHUB_USERNAME/$REPOSITORY_NAME"
    REPO_NAME="$REPOSITORY_NAME"
else
    echo "Auto-detecting current repository..."
    FULL_REPO_PATH=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
    if [ -z "$FULL_REPO_PATH" ]; then
        echo "Fatal Error: Could not detect GitHub repository. Please push to GitHub or set GITHUB_USERNAME and REPOSITORY_NAME in maestro.env."
        exit 1
    fi
    REPO_NAME="${FULL_REPO_PATH#*/}"
fi

# Determine branch
if [ -z "$BRANCH" ] || [ "$BRANCH" == "main" ]; then
    BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
fi

echo "Step 1: Preparing Codespace for $FULL_REPO_PATH on branch $BRANCH..."
EXISTING_CODESPACE=$(gh codespace list --repo $FULL_REPO_PATH --json name -q '.[0].name' 2>/dev/null)

if [ -n "$EXISTING_CODESPACE" ] && [ "$EXISTING_CODESPACE" != "null" ]; then
    echo "Found existing Codespace: $EXISTING_CODESPACE. Reusing it."
    CODESPACE_ID=$EXISTING_CODESPACE
else
    echo "Creating new Codespace (streaming setup logs)..."
    # Run in the foreground with --status so you can see the build progress
    gh codespace create --repo "$FULL_REPO_PATH" --branch "$BRANCH" --machine "$MACHINE_TYPE" --status || { echo "Fatal Error: Codespace creation failed."; exit 1; }
    
    # Retrieve the ID of the newly created Codespace
    CODESPACE_ID=$(gh codespace list --repo "$FULL_REPO_PATH" --json name -q '.[0].name' 2>/dev/null)

    if [ -z "$CODESPACE_ID" ] || [ "$CODESPACE_ID" == "null" ]; then
        echo "Fatal Error: Could not retrieve Codespace ID after creation."
        exit 1
    fi
    echo "Success: Codespace ID is $CODESPACE_ID"
fi

echo "Step 2: Syncing local configuration to Codespace..."
gh codespace cp ./maestro.env remote:/workspaces/$REPO_NAME/maestro.env --codespace $CODESPACE_ID || { echo "Fatal Error: Failed to copy config. Is the Codespace fully initialized and did you push your code?"; exit 1; }

echo "Step 3: Executing Node.js recording script..."
# Run the npm script defined in package.json which includes xvfb-run
gh codespace ssh --codespace $CODESPACE_ID -- "cd /workspaces/$REPO_NAME && npm run record" || { echo "Fatal Error: Recording execution failed."; exit 1; }

echo "Step 4: Downloading the MP4 artifact..."
# Securely copy the output.mp4 file to the local directory
gh codespace cp remote:/workspaces/$REPO_NAME/output.mp4 ./demo-recording.mp4 --codespace $CODESPACE_ID || { echo "Fatal Error: Failed to download artifact. The video may not have been created."; exit 1; }

echo "Step 5: Cleaning up Codespace..."
# Check cleanup mode (default to delete)
CLEANUP_MODE=${CODESPACE_CLEANUP_MODE:-delete}

if [ "$CLEANUP_MODE" == "stop" ]; then
    echo "Stopping the codespace (to preserve for future use)..."
    gh codespace stop --codespace $CODESPACE_ID
else
    echo "Deleting the codespace to prevent quota consumption..."
    gh codespace delete --codespace $CODESPACE_ID
fi

echo "Process finished. The file 'demo-recording.mp4' is now available locally."
