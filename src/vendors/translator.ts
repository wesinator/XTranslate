// Base class for all translation vendors
import { autobind } from "../utils";
import { settingsStore } from "../components/settings/settings.store";

export interface ITranslatorParams {
  apiKeys?: string[]
  dictionary?: string[]
  tts?: ILanguages
  languages: {
    from: ILanguages
    to?: ILanguages
  }
}

interface ILanguages {
  auto?: string;
  [lang: string]: string
}

export interface ITranslationResult {
  vendor?: string
  originalText?: string
  langFrom?: string
  langTo?: string
  langDetected?: string
  translation: string
  transcription?: string
  spellCorrection?: string
  dictionary: {
    wordType: string
    transcription?: string
    meanings: {
      word: string
      translation: string[]
      examples?: string[][]
    }[]
  }[]
}

export interface ITranslationError {
  url: string
  statusCode: number
  statusText: string;
  responseText?: string
  parseError?: string;
}

@autobind()
export abstract class Translator {
  static vendors = new Map<string, Translator>();

  static register(name: string, vendor: Translator) {
    Translator.vendors.set(name, vendor);
  }

  abstract name: string; // code name, "google"
  abstract title: string; // human readable name, e.g. "Google"
  abstract publicUrl: string; // for opening url from settings
  abstract apiUrl: string;

  protected abstract translate(from: string, to: string, text: string): Promise<ITranslationResult>;

  public lastResult: ITranslationResult;
  public lastError: ITranslationError;
  public lastAudioUrl: string;
  public ttsAudio: HTMLAudioElement;
  public ttsFormat = 'audio/mp3';
  public langFrom: ILanguages = {};
  public langTo: ILanguages = {};
  public maxUrlLength = 2048; // max length of the url for GET/POST requests
  public textMaxLength = Number.MAX_SAFE_INTEGER;
  protected autoSwapUsed = false;

  constructor(protected params: ITranslatorParams) {
    var { from: langFrom, to: langTo } = params.languages;
    var { auto, ...langToFallback } = langFrom;
    this.langFrom = langFrom;
    this.langTo = langTo || langToFallback;
  }

  protected parseJson<T = any>(res: Response): Promise<T> {
    var { status, statusText, url, ok } = res;
    var error: ITranslationError = { statusCode: status, statusText, url };
    return res.text().then(text => {
      error.responseText = text;
      var json = null;
      try {
        json = JSON.parse(text);
        if (ok) return json;
      } catch (err) {
        error.parseError = err;
      }
      throw error;
    });
  }

  async getTranslation(from: string, to: string, text: string): Promise<ITranslationResult> {
    var last = this.lastResult;
    if (last && last.langFrom === from && last.langTo === to && last.originalText === text) {
      return last;
    }
    if (text.length > this.textMaxLength) {
      text = text.substr(0, this.textMaxLength);
    }
    try {
      this.lastError = null;
      var translation = await this.translate(from, to, text);
      this.lastResult = {
        ...translation,
        vendor: this.name,
        originalText: text,
        langFrom: from,
        langTo: to,
      };
      return this.autoSwap(this.lastResult);
    } catch (err) {
      this.lastError = err;
      throw err;
    }
  }

  private autoSwap(result: ITranslationResult) {
    try {
      var { langTo, langFrom, langDetected, originalText, translation } = result;
      var autoDetect = langFrom === "auto";
      var sameText = originalText.trim().toLowerCase() === translation.toLowerCase().trim();
      if (!this.autoSwapUsed && sameText) {
        this.autoSwapUsed = true;
        var navLang = navigator.language.split('-')[0];
        if (langDetected === langTo) langTo = autoDetect ? navLang : langFrom;
        langFrom = langDetected || navLang;
        return this.getTranslation(langFrom, langTo, originalText).finally(() => {
          this.autoSwapUsed = false;
        });
      }
    } catch (err) {
      console.log("auto-swap failed", this.name, { result, err });
    }
    return result;
  };

  async playText(lang: string, text: string) {
    stopPlayingAll();
    var audioUrl = this.getAudioUrl(lang, text);
    if (settingsStore.data.useChromeTtsEngine || !audioUrl) {
      if (!chrome.tts) return;
      if (lang === "en") lang = "en-GB";
      chrome.tts.speak(text, {
          lang: lang,
          rate: 1.0
        }
      );
    }
    else if (audioUrl !== this.lastAudioUrl) {
      this.lastAudioUrl = audioUrl;
      var audio = this.ttsAudio = document.createElement('audio');
      audio.autoplay = true;
      audio.src = await getTranslator("google").getAudioSource(audioUrl);
    }
    else if (this.ttsAudio) {
      this.ttsAudio.play();
    }
  }

  getAudioUrl(lang: string, text: string): string {
    return;
  }

  getAudioSource(url: string): Promise<string> {
    return fetch(url, { credentials: 'include', referrerPolicy: "no-referrer" }).then(res => {
      var error = !(res.status >= 200 && res.status < 300);
      if (error) throw res;
      return res.blob().then(blob => URL.createObjectURL(blob));
    });
  }

  stopPlaying() {
    chrome.tts && chrome.tts.stop();
    if (!this.ttsAudio) return;
    delete this.lastAudioUrl;
    this.ttsAudio.pause();
    URL.revokeObjectURL(this.ttsAudio.src);
  }

  canTranslate(langFrom: string, langTo: string) {
    return !!(this.langFrom[langFrom] && this.langTo[langTo]);
  }
}

export function isRTL(lang: string) {
  return [
    "ar", // arabic
    "he", // hebrew (yandex, bing)
    "iw", // hebrew (google)
    "fa", // persian
    "ur", // urdu
  ].indexOf(lang) > -1;
}

export function getTranslators() {
  return [...Translator.vendors.values()];
}

export function getTranslator(name: string) {
  return Translator.vendors.get(name);
}

export function stopPlayingAll() {
  getTranslators().forEach(vendor => vendor.stopPlaying());
}

export function getNextTranslator(name: string, langFrom: string, langTo: string, reverse = false) {
  var vendors = getTranslators();
  var vendor: Translator;
  var list: Translator[] = [];
  var index = vendors.findIndex(vendor => vendor.name === name);
  var beforeCurrent = vendors.slice(0, index);
  var afterCurrent = vendors.slice(index + 1);
  if (reverse) {
    list.push(...beforeCurrent.reverse(), ...afterCurrent.reverse());
  }
  else {
    list.push(...afterCurrent, ...beforeCurrent)
  }
  while ((vendor = list.shift())) {
    if (vendor.canTranslate(langFrom, langTo)) return vendor;
  }
  return null;
}

export function isTranslation(result: ITranslationResult | any = {}): result is ITranslationResult {
  var { translation, originalText, vendor }: ITranslationResult = result;
  return !!(translation && originalText && vendor);
}
