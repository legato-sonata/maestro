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
    const displayPort = process.env.DISPLAY || ':99';
    
    const ffmpegProcess = spawn('ffmpeg', [
        '-y', 
        '-f', 'x11grab', 
        '-video_size', viewportWidth + 'x' + viewportHeight,
        '-i', displayPort, 
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        'output.mp4'
    ]);
    
    ffmpegProcess.stderr.on('data', (data) => {
        console.error(`FFMPEG LOG: ${data}`);
    });
    
    ffmpegProcess.on('error', (err) => {
        console.error(`FFMPEG ERROR: ${err}`);
    });
    
    // Give FFmpeg a brief moment to initialize before playing audio
    await page.waitForTimeout(1000);
    
    // 3.5 Attempt to interact and play music
    console.log("Attempting to start audio playback...");
    try {
        const selectors = ['.playbtn', '.play-item', 'a.play', 'button[title="Play"]', '[aria-label="Play"]', '.c-action-play'];
        let clicked = false;
        
        for (const selector of selectors) {
            const el = page.locator(selector).first();
            if (await el.count() > 0) {
                await el.click();
                console.log(`Clicked play button using selector: ${selector}`);
                clicked = true;
                break;
            }
        }
        
        if (!clicked) {
            console.log("No explicit play button found. Clicking center of screen as fallback.");
            await page.mouse.click(viewportWidth / 2, viewportHeight / 2);
        }
    } catch (err) {
        console.log("Auto-play interaction failed:", err.message);
    }
    
    // 4. Wait for a specific duration to record
    console.log(`Recording for ${recordingDuration / 1000} seconds...`);
    await page.waitForTimeout(recordingDuration);
    
    // 5. Terminate processes
    console.log("Stopping recording and closing browser...");
    await browser.close();
    
    // Send SIGINT and wait for FFmpeg to flush the MP4 moov atom
    ffmpegProcess.kill('SIGINT');
    await new Promise((resolve) => {
        ffmpegProcess.on('exit', resolve);
        // Fallback timeout in case FFmpeg hangs
        setTimeout(resolve, 3000);
    });
    console.log("Recording session complete.");
}

executeRecordingSession();
