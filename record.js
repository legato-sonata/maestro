import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

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
    
    // Ensure videos directory exists
    const videosDir = path.join(process.cwd(), 'videos');
    if (fs.existsSync(videosDir)) {
        fs.rmSync(videosDir, { recursive: true, force: true });
    }
    fs.mkdirSync(videosDir);

    console.log("Launching Chromium in App Mode with Playwright Video Recording...");
    
    // 1. Launch persistent context with App Mode pointing to about:blank
    const context = await chromium.launchPersistentContext('', {
        headless: false,
        ignoreDefaultArgs: ['--enable-automation'],
        viewport: { width: viewportWidth, height: viewportHeight },
        recordVideo: {
            dir: videosDir,
            size: { width: viewportWidth, height: viewportHeight }
        },
        args: [
            `--app=about:blank`,
            `--window-size=${viewportWidth},${viewportHeight}`,
            '--window-position=0,0',
            '--autoplay-policy=no-user-gesture-required',
            '--kiosk',
            '--disable-infobars',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu'
        ]
    });
    
    context.setDefaultTimeout(0);
    context.setDefaultNavigationTimeout(0);
    
    // App mode uses the first page created by launchPersistentContext
    const page = context.pages()[0];
    
    // 2. Start FFmpeg to record ONLY audio BEFORE navigating
    console.log("Starting FFmpeg audio recording...");
    const audioOutputFile = path.join(process.cwd(), 'audio.m4a');
    if (fs.existsSync(audioOutputFile)) fs.unlinkSync(audioOutputFile);

    const ffmpegProcess = spawn('ffmpeg', [
        '-y', 
        '-thread_queue_size', '1024',
        '-f', 'pulse',
        '-i', 'default',
        '-c:a', 'aac',
        '-b:a', '128k',
        audioOutputFile
    ]);
    
    ffmpegProcess.stderr.on('data', (data) => {
        fs.appendFileSync(logFile, `FFMPEG AUDIO LOG: ${data}\n`);
    });
    
    ffmpegProcess.on('error', (err) => {
        console.error(`FFMPEG AUDIO ERROR: ${err}`);
    });
    
    // Give FFmpeg a brief moment to initialize
    await page.waitForTimeout(500);

    // 3. Navigate to the actual target URL
    console.log(`Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { timeout: 0 });
    
    console.log("Waiting for app page to load...");
    await page.waitForTimeout(3000);
    
    console.log("Waiting before interacting...");
    await page.waitForTimeout(5000);
    
    // 3. Attempt to interact and play music
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
            await page.keyboard.press('k');
            await page.waitForTimeout(500);
            await page.keyboard.press('Space');
            await page.waitForTimeout(500);
            
            await page.mouse.click(viewportWidth / 2, viewportHeight / 2);
            
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
    
    // Get the video path BEFORE closing the context
    let videoPath = null;
    try {
        videoPath = await page.video().path();
    } catch (e) {
        console.error("Failed to retrieve Playwright video path.");
    }
    
    // 5. Terminate processes
    console.log("Stopping audio recording and closing browser...");
    await context.close(); // Finalizes the WebM video file
    
    ffmpegProcess.kill('SIGINT');
    await new Promise((resolve) => {
        ffmpegProcess.on('exit', resolve);
        // Fallback timeout in case FFmpeg hangs
        setTimeout(resolve, 3000);
    });

    console.log("Merging Playwright video and FFmpeg audio...");
    const outputPath = path.join(process.cwd(), 'output.mp4');
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    
    if (videoPath && fs.existsSync(videoPath)) {
        try {
            // Use FFmpeg to merge video and audio, convert to standard H264 MP4
            execSync(`ffmpeg -y -i "${videoPath}" -i "${audioOutputFile}" -c:v libx264 -preset fast -crf 18 -c:a aac "${outputPath}"`);
            console.log("Merge complete! Output saved to output.mp4");
            
            // Clean up raw files
            fs.unlinkSync(videoPath);
            fs.unlinkSync(audioOutputFile);
        } catch (err) {
            console.error("Failed to merge video and audio: " + err.message);
        }
    } else {
        console.error("Cannot merge: Playwright video file not found.");
    }

    console.log("Recording session complete.");
}

executeRecordingSession();
