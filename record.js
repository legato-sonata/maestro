import { chromium } from 'playwright';
import { spawn } from 'child_process';

async function executeRecordingSession() {
    const viewportWidth = 1280;
    const viewportHeight = 720;
    const targetUrl = 'https://en.wikipedia.org/wiki/Main_Page';
    
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
    console.log("Recording for 10 seconds...");
    await page.waitForTimeout(10000);
    
    // 5. Terminate processes
    console.log("Stopping recording and closing browser...");
    ffmpegProcess.kill('SIGINT');
    await browser.close();
    console.log("Recording session complete.");
}

executeRecordingSession();
