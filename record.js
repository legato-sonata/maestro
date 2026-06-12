import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';

const logFile = 'maestro.log';
fs.writeFileSync(logFile, ''); // Clear previous log

const originalLog = console.log;
console.log = function (...args) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    fs.appendFileSync(logFile, msg + '\n');
    originalLog.apply(console, args);
};

const originalError = console.error;
console.error = function (...args) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    fs.appendFileSync(logFile, 'ERROR: ' + msg + '\n');
    originalError.apply(console, args);
};

async function executeRecordingSession() {
    const viewportWidth = parseInt(process.env.VIEWPORT_WIDTH) || 1280;
    const viewportHeight = parseInt(process.env.VIEWPORT_HEIGHT) || 720;
    const targetUrl = process.env.TARGET_URL || 'https://en.wikipedia.org/wiki/Main_Page';
    const recordingDuration = parseInt(process.env.RECORDING_DURATION_MS) || 10000;
    
    // 1. Launch the browser
    console.log("Launching Chromium...");
    const browser = await chromium.launch({
        headless: false, 
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
            '--window-size=' + viewportWidth + ',' + viewportHeight,
            '--window-position=0,0',
            '--autoplay-policy=no-user-gesture-required',
            '--start-fullscreen',
            '--start-maximized',
            '--kiosk',
            '--disable-infobars',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu'
        ]
    });
    
    const context = await browser.newContext({
        viewport: { width: viewportWidth, height: viewportHeight }
    });
    
    const page = await context.newPage();
    page.setDefaultTimeout(0);
    page.setDefaultNavigationTimeout(0);
    
    // 2. Navigate to the target URL
    console.log("Navigating to URL...");
    await page.goto(targetUrl, { timeout: 0 });
    
    // 3. Start the FFmpeg recording process
    console.log("Starting FFmpeg recording...");
    const displayPort = process.env.DISPLAY || ':99';
    
    const ffmpegProcess = spawn('ffmpeg', [
        '-y', 
        '-use_wallclock_as_timestamps', '1',
        '-thread_queue_size', '1024',
        '-f', 'x11grab', 
        '-video_size', viewportWidth + 'x' + viewportHeight,
        '-framerate', '30',
        '-i', displayPort, 
        '-use_wallclock_as_timestamps', '1',
        '-thread_queue_size', '1024',
        '-f', 'pulse',
        '-i', 'default',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-c:a', 'aac',
        '-fps_mode', 'cfr',
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
    
    // Attempt to dismiss cookie consent popups universally
    try {
      await page.evaluate(() => {
        const texts = ['accept all', 'i agree', 'accept', 'allow all'];
        const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        for (let b of btns) {
          if (texts.includes(b.innerText.toLowerCase().trim())) {
            b.click();
            return;
          }
        }
      });
      await page.waitForTimeout(1000); // Wait for popup to disappear
    } catch (e) {
      // Ignore
    }

    try {
      const playSelectors = [
        'button:has(polygon[points="6 3 20 12 6 21 6 3"])',
        '.ytp-large-play-button',
        '.ytp-play-button',
        '.play-button',
        '.play-item',
        'button[aria-label="Play"]',
        'button[title="Play"]',
        'video'
      ];
        let clicked = false;
        
        for (const selector of playSelectors) {
            const el = page.locator(selector).first();
            // Use a short timeout of 2000ms instead of waiting forever
            try {
                if (await el.isVisible({ timeout: 2000 })) {
                    await el.click();
                    console.log(`Clicked play button using selector: ${selector}`);
                    clicked = true;
                    break;
                }
            } catch (e) {
                // Not visible, move on
            }
        }
        
        if (!clicked) {
            console.log("No explicit play button found. Attempting keyboard shortcuts and fallback clicks.");
            // YouTube play/pause shortcut
            await page.keyboard.press('k');
            await page.waitForTimeout(500);
            // Universal play shortcut
            await page.keyboard.press('Space');
            await page.waitForTimeout(500);
            
            await page.mouse.click(viewportWidth / 2, viewportHeight / 2);
            
            // Force play any video elements
            await page.evaluate(() => {
                document.querySelectorAll('video, audio').forEach(v => v.play().catch(() => {}));
            });
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
