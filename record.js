import { chromium } from 'playwright';
import { spawn } from 'child_process';

async function executeRecordingSession() {
    const viewportWidth = parseInt(process.env.VIEWPORT_WIDTH) || 1280;
    const viewportHeight = parseInt(process.env.VIEWPORT_HEIGHT) || 720;
    const targetUrl = process.env.TARGET_URL || 'https://en.wikipedia.org/wiki/Main_Page';
    const recordingDuration = parseInt(process.env.RECORDING_DURATION_MS) || 10000;
    
    // 1. Launch the browser
    console.log("Launching Chromium...");
    const browser = await chromium.launch({
        headless: false, 
        args: [
            '--window-size=' + viewportWidth + ',' + viewportHeight,
            '--autoplay-policy=no-user-gesture-required'
        ]
    });
    
    const context = await browser.newContext({
        viewport: { width: viewportWidth, height: viewportHeight }
    });
    
    const page = await context.newPage();
    
    // 2. Navigate to the target URL
    console.log("Navigating to URL...");
    await page.goto(targetUrl);
    
    // 3. Start the FFmpeg recording process
    console.log("Starting FFmpeg recording...");
    const displayPort = process.env.DISPLAY;
    
    const ffmpegProcess = spawn('ffmpeg', [
        '-y', 
        '-f', 'x11grab', 
        '-video_size', viewportWidth + 'x' + viewportHeight,
        '-i', displayPort, 
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        'output.mp4'
    ]);
    
    // 4. Wait for a specific duration to record
    console.log(`Recording for ${recordingDuration / 1000} seconds...`);
    await page.waitForTimeout(recordingDuration);
    
    // 5. Terminate processes
    console.log("Stopping recording and closing browser...");
    ffmpegProcess.kill('SIGINT');
    await browser.close();
    console.log("Recording session complete.");
}

executeRecordingSession();
