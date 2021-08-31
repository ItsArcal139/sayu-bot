export class Links {
    static TTS(language: string, content: string) {
        return `https://translate.google.com/translate_tts?ie=UTF-8&tl=${language}&client=tw-ob&q=${encodeURI(content)}`;
    }
}