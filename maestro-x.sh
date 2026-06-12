#!/bin/bash
source maestro.env
export DISPLAY=:99

echo "Installing Xdummy dependencies..."
sudo apt-get update -yqq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -yqq xserver-xorg-video-dummy xserver-xorg-core

W=${VIEWPORT_WIDTH:-1280}
H=${VIEWPORT_HEIGHT:-720}

echo "Generating dummy.xorg.conf for ${W}x${H}..."
cat > dummy.xorg.conf <<EOF
Section "Device"
    Identifier  "Dummy"
    Driver      "dummy"
    VideoRam    256000
    Option      "IgnoreEDID" "true"
    Option      "NoDDC" "true"
EndSection

Section "Monitor"
    Identifier  "Monitor"
    HorizSync   15.0-100.0
    VertRefresh 15.0-200.0
EndSection

Section "Screen"
    Identifier  "Screen"
    Monitor     "Monitor"
    Device      "Dummy"
    DefaultDepth 24
    SubSection "Display"
        Depth 24
        Modes "${W}x${H}"
    EndSubSection
EndSection
EOF

echo "Starting Xorg (Xdummy)..."
sudo Xorg -noreset -ac +extension GLX +extension RANDR +extension RENDER -logfile ./xdummy.log -config ./dummy.xorg.conf :99 &
XORG_PID=$!

# Wait for X to start
sleep 3

echo "Starting PulseAudio..."
pulseaudio -D --exit-idle-time=-1 || true
sleep 1

echo "Running recording script..."
node --env-file=maestro.env record.js
RECORD_EXIT=$?

echo "Cleaning up Xorg..."
sudo kill $XORG_PID

exit $RECORD_EXIT
