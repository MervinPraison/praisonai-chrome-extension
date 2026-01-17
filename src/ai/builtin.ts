/**
 * Built-in AI Integration using Gemini Nano (Chrome 138+ Stable APIs)
 * 
 * Provides access to Chrome's built-in AI APIs:
 * - LanguageModel API (Prompt API - stable in Chrome 138+ for extensions)
 * - Summarizer API (stable in Chrome 138+)
 * - Writer API (origin trial)
 * - Rewriter API (origin trial)
 * - Translator API (stable in Chrome 138+)
 * - Language Detector API (stable in Chrome 138+)
 * 
 * @see https://developer.chrome.com/docs/ai/built-in-apis
 */

export interface AICapabilities {
    promptApiAvailable: boolean;
    summarizerAvailable: boolean;
    writerAvailable: boolean;
    rewriterAvailable: boolean;
    translatorAvailable: boolean;
    languageDetectorAvailable: boolean;
}

export interface PromptOptions {
    temperature?: number;
    topK?: number;
    systemPrompt?: string;
}

export interface AIResult<T = string> {
    success: boolean;
    data?: T;
    error?: string;
}

// Type definitions for Chrome Built-in AI (Chrome 138+ stable)
declare global {
    interface LanguageModelStatic {
        availability(): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
        create(options?: {
            temperature?: number;
            topK?: number;
            systemPrompt?: string;
            monitor?: (m: EventTarget) => void;
        }): Promise<LanguageModelSession>;
        params(): Promise<{
            defaultTemperature: number;
            maxTemperature: number;
            defaultTopK: number;
            maxTopK: number;
        }>;
    }

    interface LanguageModelSession {
        prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
        promptStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
        destroy(): void;
        readonly inputUsage: number;
        readonly inputQuota: number;
    }

    interface SummarizerStatic {
        availability(): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
        create(options?: {
            type?: 'key-points' | 'tldr' | 'teaser' | 'headline';
            format?: 'markdown' | 'plain-text';
            length?: 'short' | 'medium' | 'long';
            sharedContext?: string;
            monitor?: (m: EventTarget) => void;
        }): Promise<SummarizerSession>;
    }

    interface SummarizerSession {
        summarize(text: string, options?: { context?: string }): Promise<string>;
        summarizeStreaming(text: string, options?: { context?: string }): ReadableStream<string>;
        destroy(): void;
    }

    interface WriterStatic {
        availability(): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
        create(options?: {
            tone?: 'formal' | 'neutral' | 'casual';
            format?: 'markdown' | 'plain-text';
            length?: 'short' | 'medium' | 'long';
            sharedContext?: string;
            monitor?: (m: EventTarget) => void;
        }): Promise<WriterSession>;
    }

    interface WriterSession {
        write(prompt: string, options?: { context?: string }): Promise<string>;
        writeStreaming(prompt: string, options?: { context?: string }): ReadableStream<string>;
        destroy(): void;
    }

    interface RewriterStatic {
        availability(): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
        create(options?: {
            tone?: 'more-formal' | 'as-is' | 'more-casual';
            format?: 'as-is' | 'markdown' | 'plain-text';
            length?: 'shorter' | 'as-is' | 'longer';
            sharedContext?: string;
            monitor?: (m: EventTarget) => void;
        }): Promise<RewriterSession>;
    }

    interface RewriterSession {
        rewrite(text: string, options?: { context?: string }): Promise<string>;
        rewriteStreaming(text: string, options?: { context?: string }): ReadableStream<string>;
        destroy(): void;
    }

    interface TranslatorStatic {
        availability(): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
        create(options: {
            sourceLanguage: string;
            targetLanguage: string;
        }): Promise<TranslatorSession>;
    }

    interface TranslatorSession {
        translate(text: string): Promise<string>;
        destroy(): void;
    }

    interface LanguageDetectorStatic {
        availability(): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
        create(): Promise<LanguageDetectorSession>;
    }

    interface LanguageDetectorSession {
        detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
        destroy(): void;
    }

    // Global API objects (Chrome 138+)
    const LanguageModel: LanguageModelStatic | undefined;
    const Summarizer: SummarizerStatic | undefined;
    const Writer: WriterStatic | undefined;
    const Rewriter: RewriterStatic | undefined;
    const Translator: TranslatorStatic | undefined;
    // Note: window.ai may still exist for backwards compat
    interface Window {
        ai?: {
            languageModel?: LanguageModelStatic;
            summarizer?: SummarizerStatic;
            writer?: WriterStatic;
            rewriter?: RewriterStatic;
            translator?: TranslatorStatic;
            languageDetector?: LanguageDetectorStatic;
        };
    }
}

/**
 * Chrome Built-in AI Client (Chrome 138+ stable APIs)
 */
export class BuiltInAI {
    private session: LanguageModelSession | null = null;
    private capabilities: AICapabilities | null = null;

    /**
     * Get the LanguageModel API (supports both new global and legacy window.ai)
     */
    private getLanguageModel(): LanguageModelStatic | undefined {
        // Chrome 138+ uses global LanguageModel
        if (typeof LanguageModel !== 'undefined') {
            return LanguageModel;
        }
        // Fallback to window.ai for backwards compatibility
        return window.ai?.languageModel;
    }

    /**
     * Get the Summarizer API
     */
    private getSummarizer(): SummarizerStatic | undefined {
        if (typeof Summarizer !== 'undefined') {
            return Summarizer;
        }
        return window.ai?.summarizer;
    }

    /**
     * Get the Writer API
     */
    private getWriter(): WriterStatic | undefined {
        if (typeof Writer !== 'undefined') {
            return Writer;
        }
        return window.ai?.writer;
    }

    /**
     * Get the Rewriter API
     */
    private getRewriter(): RewriterStatic | undefined {
        if (typeof Rewriter !== 'undefined') {
            return Rewriter;
        }
        return window.ai?.rewriter;
    }

    /**
     * Check what AI capabilities are available
     */
    async checkCapabilities(): Promise<AIResult<AICapabilities>> {
        try {
            const capabilities: AICapabilities = {
                promptApiAvailable: false,
                summarizerAvailable: false,
                writerAvailable: false,
                rewriterAvailable: false,
                translatorAvailable: false,
                languageDetectorAvailable: false,
            };

            // Check LanguageModel (Prompt API)
            const languageModel = this.getLanguageModel();
            if (languageModel) {
                try {
                    const avail = await languageModel.availability();
                    capabilities.promptApiAvailable = avail === 'available' || avail === 'downloadable';
                } catch (e) {
                    console.warn('[BuiltInAI] LanguageModel check failed:', e);
                }
            }

            // Check Summarizer
            const summarizer = this.getSummarizer();
            if (summarizer) {
                try {
                    const avail = await summarizer.availability();
                    capabilities.summarizerAvailable = avail === 'available' || avail === 'downloadable';
                } catch (e) {
                    console.warn('[BuiltInAI] Summarizer check failed:', e);
                }
            }

            // Check Writer
            const writer = this.getWriter();
            if (writer) {
                try {
                    const avail = await writer.availability();
                    capabilities.writerAvailable = avail === 'available' || avail === 'downloadable';
                } catch (e) {
                    console.warn('[BuiltInAI] Writer check failed:', e);
                }
            }

            // Check Rewriter
            const rewriter = this.getRewriter();
            if (rewriter) {
                try {
                    const avail = await rewriter.availability();
                    capabilities.rewriterAvailable = avail === 'available' || avail === 'downloadable';
                } catch (e) {
                    console.warn('[BuiltInAI] Rewriter check failed:', e);
                }
            }

            // Check Translator (via window.ai for now)
            if (window.ai?.translator) {
                try {
                    const avail = await window.ai.translator.availability();
                    capabilities.translatorAvailable = avail === 'available' || avail === 'downloadable';
                } catch (e) {
                    console.warn('[BuiltInAI] Translator check failed:', e);
                }
            }

            // Check Language Detector
            if (window.ai?.languageDetector) {
                try {
                    const avail = await window.ai.languageDetector.availability();
                    capabilities.languageDetectorAvailable = avail === 'available' || avail === 'downloadable';
                } catch (e) {
                    console.warn('[BuiltInAI] LanguageDetector check failed:', e);
                }
            }

            this.capabilities = capabilities;
            console.log('[BuiltInAI] Capabilities:', capabilities);
            return { success: true, data: capabilities };
        } catch (error) {
            return {
                success: false,
                error: `Failed to check AI capabilities: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Create or get AI session for prompting
     */
    async getSession(options?: PromptOptions): Promise<AIResult<LanguageModelSession>> {
        if (this.session) {
            return { success: true, data: this.session };
        }

        try {
            const languageModel = this.getLanguageModel();
            if (!languageModel) {
                return { success: false, error: 'LanguageModel API not available. Requires Chrome 138+.' };
            }

            // Check availability first
            const availability = await languageModel.availability();
            if (availability === 'unavailable') {
                return { success: false, error: 'LanguageModel is unavailable on this device.' };
            }

            // Get model params for optimal settings
            let temperature = options?.temperature ?? 0.7;
            let topK = options?.topK ?? 40;

            try {
                const params = await languageModel.params();
                temperature = Math.min(temperature, params.maxTemperature);
                topK = Math.min(topK, params.maxTopK);
            } catch (e) {
                console.warn('[BuiltInAI] Could not get model params, using defaults');
            }

            this.session = await languageModel.create({
                temperature,
                topK,
                systemPrompt: options?.systemPrompt,
                monitor: (m) => {
                    m.addEventListener('downloadprogress', (e: Event) => {
                        const progress = e as ProgressEvent;
                        console.log(`[BuiltInAI] Model download: ${Math.round((progress.loaded / progress.total) * 100)}%`);
                    });
                },
            });

            return { success: true, data: this.session };
        } catch (error) {
            return {
                success: false,
                error: `Failed to create AI session: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Send prompt to Gemini Nano
     */
    async prompt(input: string, options?: PromptOptions): Promise<AIResult<string>> {
        const sessionResult = await this.getSession(options);
        if (!sessionResult.success || !sessionResult.data) {
            return { success: false, error: sessionResult.error };
        }

        try {
            const response = await sessionResult.data.prompt(input);
            return { success: true, data: response };
        } catch (error) {
            return {
                success: false,
                error: `Prompt failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Stream prompt response
     */
    async *promptStreaming(
        input: string,
        options?: PromptOptions
    ): AsyncGenerator<AIResult<string>> {
        const sessionResult = await this.getSession(options);
        if (!sessionResult.success || !sessionResult.data) {
            yield { success: false, error: sessionResult.error };
            return;
        }

        try {
            const stream = sessionResult.data.promptStreaming(input);
            const reader = stream.getReader();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                yield { success: true, data: value };
            }
        } catch (error) {
            yield {
                success: false,
                error: `Streaming failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Summarize text using Summarizer API
     */
    async summarize(text: string, type: 'key-points' | 'tldr' | 'teaser' | 'headline' = 'key-points'): Promise<AIResult<string>> {
        try {
            const summarizer = this.getSummarizer();
            if (!summarizer) {
                return { success: false, error: 'Summarizer API not available' };
            }

            const availability = await summarizer.availability();
            if (availability === 'unavailable') {
                return { success: false, error: 'Summarizer is unavailable on this device' };
            }

            const session = await summarizer.create({
                type,
                format: 'markdown',
                length: 'medium',
            });

            const summary = await session.summarize(text);
            session.destroy();

            return { success: true, data: summary };
        } catch (error) {
            return {
                success: false,
                error: `Summarization failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Generate text with Writer API
     */
    async write(prompt: string, tone: 'formal' | 'neutral' | 'casual' = 'neutral'): Promise<AIResult<string>> {
        try {
            const writer = this.getWriter();
            if (!writer) {
                return { success: false, error: 'Writer API not available (requires origin trial)' };
            }

            const availability = await writer.availability();
            if (availability === 'unavailable') {
                return { success: false, error: 'Writer is unavailable on this device' };
            }

            const session = await writer.create({
                tone,
                format: 'plain-text',
                length: 'medium',
            });

            const result = await session.write(prompt);
            session.destroy();

            return { success: true, data: result };
        } catch (error) {
            return {
                success: false,
                error: `Writing failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Rewrite text
     */
    async rewrite(text: string, tone: 'more-formal' | 'as-is' | 'more-casual' = 'as-is'): Promise<AIResult<string>> {
        try {
            const rewriter = this.getRewriter();
            if (!rewriter) {
                return { success: false, error: 'Rewriter API not available (requires origin trial)' };
            }

            const availability = await rewriter.availability();
            if (availability === 'unavailable') {
                return { success: false, error: 'Rewriter is unavailable on this device' };
            }

            const session = await rewriter.create({
                tone,
                format: 'as-is',
                length: 'as-is',
            });

            const result = await session.rewrite(text);
            session.destroy();

            return { success: true, data: result };
        } catch (error) {
            return {
                success: false,
                error: `Rewriting failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Translate text
     */
    async translate(
        text: string,
        sourceLanguage: string,
        targetLanguage: string
    ): Promise<AIResult<string>> {
        try {
            if (!window.ai?.translator) {
                return { success: false, error: 'Translator API not available' };
            }

            const translator = await window.ai.translator.create({
                sourceLanguage,
                targetLanguage,
            });

            const result = await translator.translate(text);
            translator.destroy();

            return { success: true, data: result };
        } catch (error) {
            return {
                success: false,
                error: `Translation failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Detect language
     */
    async detectLanguage(
        text: string
    ): Promise<AIResult<Array<{ language: string; confidence: number }>>> {
        try {
            if (!window.ai?.languageDetector) {
                return { success: false, error: 'Language Detector API not available' };
            }

            const detector = await window.ai.languageDetector.create();
            const results = await detector.detect(text);
            detector.destroy();

            return {
                success: true,
                data: results.map((r) => ({
                    language: r.detectedLanguage,
                    confidence: r.confidence,
                })),
            };
        } catch (error) {
            return {
                success: false,
                error: `Language detection failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Destroy session and clean up resources
     */
    destroy(): void {
        if (this.session) {
            this.session.destroy();
            this.session = null;
        }
    }
}

/**
 * Singleton instance for easy access
 */
export const builtInAI = new BuiltInAI();

/**
 * Helper to get a built-in AI session for hybrid mode
 */
export interface BuiltInAISession {
    prompt(input: string): Promise<string>;
    destroy(): void;
}

export async function getBuiltInAI(): Promise<BuiltInAISession | null> {
    const result = await builtInAI.checkCapabilities();
    if (!result.success || !result.data?.promptApiAvailable) {
        console.log('[BuiltInAI] Prompt API not available');
        return null;
    }

    return {
        prompt: async (input: string) => {
            const result = await builtInAI.prompt(input);
            if (!result.success) {
                throw new Error(result.error);
            }
            return result.data!;
        },
        destroy: () => builtInAI.destroy(),
    };
}
