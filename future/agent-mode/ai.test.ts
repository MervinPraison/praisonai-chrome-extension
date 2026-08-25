/**
 * Tests for Built-in AI Client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock window.ai
const mockAI = {
    languageModel: {
        capabilities: vi.fn(),
        create: vi.fn(),
    },
    summarizer: {
        capabilities: vi.fn(),
        create: vi.fn(),
    },
    writer: {
        capabilities: vi.fn(),
        create: vi.fn(),
    },
    rewriter: {
        capabilities: vi.fn(),
        create: vi.fn(),
    },
    translator: {
        capabilities: vi.fn(),
        create: vi.fn(),
    },
    languageDetector: {
        capabilities: vi.fn(),
        create: vi.fn(),
    },
};

// @ts-expect-error - Mocking window.ai
globalThis.window = { ai: mockAI };

// Import after mocking
import { BuiltInAI, builtInAI } from '../src/ai/builtin';

describe('BuiltInAI', () => {
    let ai: BuiltInAI;

    beforeEach(() => {
        vi.clearAllMocks();
        ai = new BuiltInAI();
    });

    describe('checkCapabilities', () => {
        it('should return all available capabilities', async () => {
            mockAI.languageModel.capabilities.mockResolvedValue({ available: 'readily' });
            mockAI.summarizer.capabilities.mockResolvedValue({ available: 'readily' });
            mockAI.writer.capabilities.mockResolvedValue({ available: 'readily' });
            mockAI.rewriter.capabilities.mockResolvedValue({ available: 'readily' });
            mockAI.translator.capabilities.mockResolvedValue({ available: 'after-download' });
            mockAI.languageDetector.capabilities.mockResolvedValue({ available: 'no' });

            const result = await ai.checkCapabilities();

            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                promptApiAvailable: true,
                summarizerAvailable: true,
                writerAvailable: true,
                rewriterAvailable: true,
                translatorAvailable: false,
                languageDetectorAvailable: false,
            });
        });

        it('should handle missing AI', async () => {
            // @ts-expect-error - Testing missing AI
            globalThis.window = {};
            const noAI = new BuiltInAI();

            const result = await noAI.checkCapabilities();

            expect(result.success).toBe(false);
            expect(result.error).toContain('Built-in AI not available');

            // Restore mock
            // @ts-expect-error - Restoring mock
            globalThis.window = { ai: mockAI };
        });
    });

    describe('prompt', () => {
        it('should send prompt and return response', async () => {
            const mockSession = {
                prompt: vi.fn().mockResolvedValue('Hello, I am Gemini!'),
                promptStreaming: vi.fn(),
                destroy: vi.fn(),
            };
            mockAI.languageModel.create.mockResolvedValue(mockSession);

            const result = await ai.prompt('Say hello');

            expect(result.success).toBe(true);
            expect(result.data).toBe('Hello, I am Gemini!');
            expect(mockSession.prompt).toHaveBeenCalledWith('Say hello');
        });

        it('should use provided options', async () => {
            const mockSession = {
                prompt: vi.fn().mockResolvedValue('Response'),
                promptStreaming: vi.fn(),
                destroy: vi.fn(),
            };
            mockAI.languageModel.create.mockResolvedValue(mockSession);

            await ai.prompt('Test', {
                temperature: 0.5,
                topK: 10,
                systemPrompt: 'You are helpful',
            });

            expect(mockAI.languageModel.create).toHaveBeenCalledWith({
                temperature: 0.5,
                topK: 10,
                systemPrompt: 'You are helpful',
            });
        });

        it('should reuse existing session', async () => {
            const mockSession = {
                prompt: vi.fn().mockResolvedValue('Response'),
                promptStreaming: vi.fn(),
                destroy: vi.fn(),
            };
            mockAI.languageModel.create.mockResolvedValue(mockSession);

            await ai.prompt('First');
            await ai.prompt('Second');

            expect(mockAI.languageModel.create).toHaveBeenCalledTimes(1);
            expect(mockSession.prompt).toHaveBeenCalledTimes(2);
        });
    });

    describe('summarize', () => {
        it('should summarize text', async () => {
            const mockSummarizer = {
                summarize: vi.fn().mockResolvedValue('Summary: Key points here'),
                destroy: vi.fn(),
            };
            mockAI.summarizer.create.mockResolvedValue(mockSummarizer);

            const result = await ai.summarize('Long text here...');

            expect(result.success).toBe(true);
            expect(result.data).toBe('Summary: Key points here');
            expect(mockSummarizer.destroy).toHaveBeenCalled();
        });

        it('should handle missing summarizer', async () => {
            // @ts-expect-error - Testing partial AI
            globalThis.window = { ai: { languageModel: mockAI.languageModel } };
            const partialAI = new BuiltInAI();

            const result = await partialAI.summarize('Text');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Summarizer API not available');

            // Restore
            // @ts-expect-error - Restoring mock
            globalThis.window = { ai: mockAI };
        });
    });

    describe('write', () => {
        it('should generate text', async () => {
            const mockWriter = {
                write: vi.fn().mockResolvedValue('Generated content'),
                destroy: vi.fn(),
            };
            mockAI.writer.create.mockResolvedValue(mockWriter);

            const result = await ai.write('Write a poem');

            expect(result.success).toBe(true);
            expect(result.data).toBe('Generated content');
        });
    });

    describe('rewrite', () => {
        it('should rewrite text', async () => {
            const mockRewriter = {
                rewrite: vi.fn().mockResolvedValue('Improved text'),
                destroy: vi.fn(),
            };
            mockAI.rewriter.create.mockResolvedValue(mockRewriter);

            const result = await ai.rewrite('This is bad text');

            expect(result.success).toBe(true);
            expect(result.data).toBe('Improved text');
        });
    });

    describe('translate', () => {
        it('should translate text', async () => {
            const mockTranslator = {
                translate: vi.fn().mockResolvedValue('Hola mundo'),
                destroy: vi.fn(),
            };
            mockAI.translator.create.mockResolvedValue(mockTranslator);

            const result = await ai.translate('Hello world', 'en', 'es');

            expect(result.success).toBe(true);
            expect(result.data).toBe('Hola mundo');
            expect(mockAI.translator.create).toHaveBeenCalledWith({
                sourceLanguage: 'en',
                targetLanguage: 'es',
            });
        });
    });

    describe('detectLanguage', () => {
        it('should detect language', async () => {
            const mockDetector = {
                detect: vi.fn().mockResolvedValue([
                    { detectedLanguage: 'en', confidence: 0.95 },
                    { detectedLanguage: 'de', confidence: 0.03 },
                ]),
                destroy: vi.fn(),
            };
            mockAI.languageDetector.create.mockResolvedValue(mockDetector);

            const result = await ai.detectLanguage('Hello world');

            expect(result.success).toBe(true);
            expect(result.data).toEqual([
                { language: 'en', confidence: 0.95 },
                { language: 'de', confidence: 0.03 },
            ]);
        });
    });

    describe('destroy', () => {
        it('should destroy session', async () => {
            const mockSession = {
                prompt: vi.fn().mockResolvedValue('Response'),
                promptStreaming: vi.fn(),
                destroy: vi.fn(),
            };
            mockAI.languageModel.create.mockResolvedValue(mockSession);

            await ai.prompt('Test');
            ai.destroy();

            expect(mockSession.destroy).toHaveBeenCalled();
        });
    });
});

describe('builtInAI singleton', () => {
    it('should be an instance of BuiltInAI', () => {
        expect(builtInAI).toBeInstanceOf(BuiltInAI);
    });
});
