/**
 * Built-in AI Integration using Gemini Nano
 * 
 * Provides access to Chrome's built-in AI APIs:
 * - Prompt API (general LLM prompts)
 * - Summarizer API
 * - Writer API
 * - Rewriter API
 * - Translator API
 * - Language Detector API
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

// Type definitions for Chrome Built-in AI (not yet in @types/chrome)
declare global {
    interface Window {
        ai?: {
            languageModel?: {
                capabilities(): Promise<{ available: string }>;
                create(options?: {
                    temperature?: number;
                    topK?: number;
                    systemPrompt?: string;
                }): Promise<AISession>;
            };
            summarizer?: {
                capabilities(): Promise<{ available: string }>;
                create(options?: { type?: string; format?: string; length?: string }): Promise<AISummarizer>;
            };
            writer?: {
                capabilities(): Promise<{ available: string }>;
                create(options?: { tone?: string; format?: string; length?: string }): Promise<AIWriter>;
            };
            rewriter?: {
                capabilities(): Promise<{ available: string }>;
                create(options?: { tone?: string; format?: string; length?: string }): Promise<AIRewriter>;
            };
            translator?: {
                capabilities(): Promise<{ available: string }>;
                create(options: { sourceLanguage: string; targetLanguage: string }): Promise<AITranslator>;
            };
            languageDetector?: {
                capabilities(): Promise<{ available: string }>;
                create(): Promise<AILanguageDetector>;
            };
        };
    }

    interface AISession {
        prompt(input: string): Promise<string>;
        promptStreaming(input: string): AsyncIterable<string>;
        destroy(): void;
    }

    interface AISummarizer {
        summarize(text: string): Promise<string>;
        destroy(): void;
    }

    interface AIWriter {
        write(prompt: string): Promise<string>;
        destroy(): void;
    }

    interface AIRewriter {
        rewrite(text: string): Promise<string>;
        destroy(): void;
    }

    interface AITranslator {
        translate(text: string): Promise<string>;
        destroy(): void;
    }

    interface AILanguageDetector {
        detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
        destroy(): void;
    }
}

/**
 * Chrome Built-in AI Client
 */
export class BuiltInAI {
    private session: AISession | null = null;
    private capabilities: AICapabilities | null = null;

    /**
     * Check what AI capabilities are available
     */
    async checkCapabilities(): Promise<AIResult<AICapabilities>> {
        try {
            const ai = window.ai;
            if (!ai) {
                return {
                    success: false,
                    error: 'Built-in AI not available. Requires Chrome 138+ with AI enabled.',
                };
            }

            const capabilities: AICapabilities = {
                promptApiAvailable: false,
                summarizerAvailable: false,
                writerAvailable: false,
                rewriterAvailable: false,
                translatorAvailable: false,
                languageDetectorAvailable: false,
            };

            // Check each API
            if (ai.languageModel) {
                const cap = await ai.languageModel.capabilities();
                capabilities.promptApiAvailable = cap.available === 'readily';
            }

            if (ai.summarizer) {
                const cap = await ai.summarizer.capabilities();
                capabilities.summarizerAvailable = cap.available === 'readily';
            }

            if (ai.writer) {
                const cap = await ai.writer.capabilities();
                capabilities.writerAvailable = cap.available === 'readily';
            }

            if (ai.rewriter) {
                const cap = await ai.rewriter.capabilities();
                capabilities.rewriterAvailable = cap.available === 'readily';
            }

            if (ai.translator) {
                const cap = await ai.translator.capabilities();
                capabilities.translatorAvailable = cap.available === 'readily';
            }

            if (ai.languageDetector) {
                const cap = await ai.languageDetector.capabilities();
                capabilities.languageDetectorAvailable = cap.available === 'readily';
            }

            this.capabilities = capabilities;
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
    async getSession(options?: PromptOptions): Promise<AIResult<AISession>> {
        if (this.session) {
            return { success: true, data: this.session };
        }

        try {
            const ai = window.ai;
            if (!ai?.languageModel) {
                return { success: false, error: 'Prompt API not available' };
            }

            this.session = await ai.languageModel.create({
                temperature: options?.temperature ?? 0.7,
                topK: options?.topK ?? 40,
                systemPrompt: options?.systemPrompt,
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
            for await (const chunk of sessionResult.data.promptStreaming(input)) {
                yield { success: true, data: chunk };
            }
        } catch (error) {
            yield {
                success: false,
                error: `Streaming failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Summarize text
     */
    async summarize(text: string): Promise<AIResult<string>> {
        try {
            const ai = window.ai;
            if (!ai?.summarizer) {
                return { success: false, error: 'Summarizer API not available' };
            }

            const summarizer = await ai.summarizer.create({
                type: 'key-points',
                format: 'markdown',
                length: 'medium',
            });

            const summary = await summarizer.summarize(text);
            summarizer.destroy();

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
    async write(prompt: string): Promise<AIResult<string>> {
        try {
            const ai = window.ai;
            if (!ai?.writer) {
                return { success: false, error: 'Writer API not available' };
            }

            const writer = await ai.writer.create({
                tone: 'neutral',
                format: 'plain-text',
                length: 'medium',
            });

            const result = await writer.write(prompt);
            writer.destroy();

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
    async rewrite(text: string): Promise<AIResult<string>> {
        try {
            const ai = window.ai;
            if (!ai?.rewriter) {
                return { success: false, error: 'Rewriter API not available' };
            }

            const rewriter = await ai.rewriter.create({
                tone: 'as-is',
                format: 'as-is',
                length: 'as-is',
            });

            const result = await rewriter.rewrite(text);
            rewriter.destroy();

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
            const ai = window.ai;
            if (!ai?.translator) {
                return { success: false, error: 'Translator API not available' };
            }

            const translator = await ai.translator.create({
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
            const ai = window.ai;
            if (!ai?.languageDetector) {
                return { success: false, error: 'Language Detector API not available' };
            }

            const detector = await ai.languageDetector.create();
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
