/**
 * Offscreen Document
 * 
 * Used for operations that require DOM APIs unavailable in service worker:
 * - Canvas operations for image processing
 * - MediaRecorder for video recording
 * - Base64 encoding/decoding
 */

interface RecordingState {
    isRecording: boolean;
    mediaRecorder: MediaRecorder | null;
    chunks: Blob[];
    startTime: number;
}

const recordingState: RecordingState = {
    isRecording: false,
    mediaRecorder: null,
    chunks: [],
    startTime: 0,
};

/**
 * Handle messages from service worker
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
});

/**
 * Message handler
 */
async function handleMessage(message: {
    type: string;
    [key: string]: unknown;
}): Promise<unknown> {
    switch (message.type) {
        case 'START_RECORDING':
            return startRecording(message.tabId as number);

        case 'STOP_RECORDING':
            return stopRecording();

        case 'GET_RECORDING_STATUS':
            return getRecordingStatus();

        case 'PROCESS_IMAGE':
            return processImage(message.data as string, message.operation as string);

        case 'ENCODE_VIDEO':
            return encodeVideo(message.frames as string[]);

        default:
            return { success: false, error: `Unknown message type: ${message.type}` };
    }
}

/**
 * Start screen recording using tab capture
 */
async function startRecording(tabId: number): Promise<{ success: boolean; error?: string }> {
    if (recordingState.isRecording) {
        return { success: false, error: 'Already recording' };
    }

    try {
        // Request tab capture stream
        const stream = await chrome.tabCapture.capture({
            video: true,
            audio: false,
            videoConstraints: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    maxWidth: 1920,
                    maxHeight: 1080,
                    maxFrameRate: 30,
                },
            },
        });

        if (!stream) {
            return { success: false, error: 'Failed to capture tab' };
        }

        // Create media recorder
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 2500000,
        });

        recordingState.chunks = [];
        recordingState.startTime = Date.now();

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordingState.chunks.push(event.data);
            }
        };

        mediaRecorder.start(1000); // Collect data every second

        recordingState.isRecording = true;
        recordingState.mediaRecorder = mediaRecorder;

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: `Recording failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Stop recording and return video data
 */
async function stopRecording(): Promise<{
    success: boolean;
    data?: { blob: Blob; duration: number };
    error?: string;
}> {
    if (!recordingState.isRecording || !recordingState.mediaRecorder) {
        return { success: false, error: 'Not recording' };
    }

    return new Promise((resolve) => {
        recordingState.mediaRecorder!.onstop = () => {
            const blob = new Blob(recordingState.chunks, { type: 'video/webm' });
            const duration = Date.now() - recordingState.startTime;

            // Stop all tracks
            recordingState.mediaRecorder!.stream.getTracks().forEach((track) => {
                track.stop();
            });

            recordingState.isRecording = false;
            recordingState.mediaRecorder = null;
            recordingState.chunks = [];

            resolve({
                success: true,
                data: { blob, duration },
            });
        };

        recordingState.mediaRecorder!.stop();
    });
}

/**
 * Get current recording status
 */
function getRecordingStatus(): {
    success: boolean;
    data: { isRecording: boolean; duration: number };
} {
    return {
        success: true,
        data: {
            isRecording: recordingState.isRecording,
            duration: recordingState.isRecording
                ? Date.now() - recordingState.startTime
                : 0,
        },
    };
}

/**
 * Process image using canvas
 */
async function processImage(
    base64Data: string,
    operation: string
): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d')!;

        // Load image
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = `data:image/png;base64,${base64Data}`;
        });

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Apply operation
        switch (operation) {
            case 'grayscale':
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    data[i] = avg;
                    data[i + 1] = avg;
                    data[i + 2] = avg;
                }
                ctx.putImageData(imageData, 0, 0);
                break;

            case 'resize':
                // Resize to 50%
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width / 2;
                tempCanvas.height = canvas.height / 2;
                const tempCtx = tempCanvas.getContext('2d')!;
                tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
                canvas.width = tempCanvas.width;
                canvas.height = tempCanvas.height;
                ctx.drawImage(tempCanvas, 0, 0);
                break;

            case 'annotate':
                // Add timestamp
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.font = '16px Arial';
                const timestamp = new Date().toISOString();
                ctx.strokeText(timestamp, 10, 30);
                ctx.fillText(timestamp, 10, 30);
                break;
        }

        // Return processed image
        const processedData = canvas.toDataURL('image/png').split(',')[1];
        return { success: true, data: processedData };
    } catch (error) {
        return {
            success: false,
            error: `Image processing failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Encode frames to video (for screenshot-based recording)
 */
async function encodeVideo(
    frames: string[]
): Promise<{ success: boolean; data?: Blob; error?: string }> {
    if (frames.length === 0) {
        return { success: false, error: 'No frames provided' };
    }

    try {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d')!;

        // Load first frame to get dimensions
        const firstImg = new Image();
        await new Promise<void>((resolve) => {
            firstImg.onload = () => resolve();
            firstImg.src = `data:image/png;base64,${frames[0]}`;
        });

        canvas.width = firstImg.width;
        canvas.height = firstImg.height;

        // Create video stream from canvas
        const stream = canvas.captureStream(10);
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9',
        });

        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

        // Start recording
        mediaRecorder.start();

        // Draw each frame
        for (const frame of frames) {
            const img = new Image();
            await new Promise<void>((resolve) => {
                img.onload = () => {
                    ctx.drawImage(img, 0, 0);
                    resolve();
                };
                img.src = `data:image/png;base64,${frame}`;
            });
            // Wait for frame rate
            await new Promise((r) => setTimeout(r, 100));
        }

        // Stop and return video
        return new Promise((resolve) => {
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                resolve({ success: true, data: blob });
            };
            mediaRecorder.stop();
        });
    } catch (error) {
        return {
            success: false,
            error: `Video encoding failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

console.log('[PraisonAI] Offscreen document loaded');
