import "./select-language.scss";

import React from "react";
import ReactSelect, { Props as ReactSelectProps } from "react-select";
import { action, computed, makeObservable } from "mobx";
import { observer } from "mobx-react";
import { cssNames } from "../../utils";
import { getTranslator } from "../../vendors";
import { getMessage } from "../../i18n";
import { Icon } from "../icon";
import { FavoriteLangDirection, settingsStore } from "../settings/settings.storage";

export interface Props extends Omit<ReactSelectProps, "onChange"> {
  className?: string;
  vendor?: string;
  from?: string;
  to?: string;
  showInfoIcon?: boolean;
  onChange?(update: { langFrom: string, langTo: string }): void;
  onSwap?(update: { langFrom: string, langTo: string }): void;
}

@observer
export class SelectLanguage extends React.Component<Props> {
  constructor(props: Props) {
    super(props);
    makeObservable(this);
  }

  @computed get langFrom() {
    return this.props.from ?? settingsStore.data.langFrom;
  }

  @computed get langTo() {
    return this.props.to ?? settingsStore.data.langTo;
  }

  @computed get vendor() {
    return this.props.vendor ?? settingsStore.data.vendor;
  }

  @computed get sourceFavorites(): string[] {
    return settingsStore.getFavorites(this.vendor, "source")
  }

  @computed get targetFavorites(): string[] {
    return settingsStore.getFavorites(this.vendor, "target")
  }

  @computed get sourceLanguageOptions() {
    var { langFrom: sourceLangList } = getTranslator(this.vendor);

    var getOption = (lang: string) => ({
      value: lang,
      isDisabled: lang == this.langTo,
      isSelected: lang == this.langFrom,
      label: sourceLangList[lang as keyof typeof sourceLangList],
    });

    const sourceLanguageOptions = Object.keys(sourceLangList).map(getOption);

    // return groups with favorites if exists
    if (this.sourceFavorites.length > 0) {
      return [
        { options: this.sourceFavorites.map(getOption), label: getMessage("favorites_lang_title") },
        { options: sourceLanguageOptions, label: getMessage("source_lang_placeholder") },
      ]
    }

    return [
      { options: sourceLanguageOptions }
    ];
  }

  @computed get targetLanguageOptions() {
    var { langTo: targetLangList } = getTranslator(this.vendor);

    var getOption = (lang: string) => ({
      value: lang,
      isDisabled: lang == this.langFrom,
      isSelected: lang == this.langTo,
      label: targetLangList[lang as keyof typeof targetLangList],
    });

    const targetLanguageOptions = Object.keys(targetLangList).map(getOption);

    // return multiple groups when favorites list not empty
    if (this.targetFavorites.length > 0) {
      return [
        { options: this.targetFavorites.map(getOption), label: getMessage("favorites_lang_title") },
        { options: targetLanguageOptions, label: getMessage("target_lang_placeholder") },
      ]
    }

    return [
      { options: targetLanguageOptions },
    ];
  }

  @action
  private onSwap = () => {
    const { langFrom, langTo } = this;
    if (langFrom === "auto") return; // not possible translate to "auto"
    this.onChange({ sourceLang: langTo, targetLang: langFrom }); // trigger update
    this.props.onSwap?.({ langFrom, langTo });
  }

  @action
  private onChange = (update: { sourceLang?: string, targetLang?: string } = {}) => {
    const {
      sourceLang = this.langFrom,
      targetLang = this.langTo,
    } = update;

    if (this.props.onChange) {
      this.props.onChange({ langFrom: sourceLang, langTo: targetLang })
    } else {
      settingsStore.data.langFrom = sourceLang;
      settingsStore.data.langTo = targetLang;
    }
  }

  @action
  toggleFavorite = (evt: React.MouseEvent, lang: string, sourceType: FavoriteLangDirection) => {
    const isAutoDetect = lang == "auto"
    const isToggleAction = evt.metaKey || (evt.altKey && evt.shiftKey);
    if (isAutoDetect || !isToggleAction) return; // skip: normal select

    // save updated favorite to storage
    settingsStore.toggleFavorite({
      vendor: this.vendor,
      sourceType, lang
    });

    // skip selecting new language (hopefully)
    evt.stopPropagation();
    evt.preventDefault();
  }

  formatLanguageLabel(opts: { lang: string, title: string, sourceType: FavoriteLangDirection }): React.ReactNode {
    const flagIcon = getFlagIcon(opts.lang);
    return (
      <div
        className={cssNames("language flex gaps align-center", opts.lang)}
        onClick={evt => this.toggleFavorite(evt, opts.lang, opts.sourceType)}
      >
        {flagIcon && <img className="country-icon" src={flagIcon} alt=""/>}
        <span>{opts.title}</span>
      </div>
    )
  }

  render() {
    var { langFrom, langTo } = this;
    var { className, showInfoIcon } = this.props;

    const sourceLang = this.sourceLanguageOptions
      .flatMap(group => group.options)
      .find(({ value: lang }) => lang == langFrom);

    const targetLang = this.targetLanguageOptions
      .flatMap(group => group.options)
      .find(({ value: lang }) => lang == langTo);

    return (
      <div className={cssNames("SelectLanguage flex gaps align-center", className)}>
        <ReactSelect
          // menuIsOpen={true}
          className="Select"
          classNamePrefix="ReactSelect"
          placeholder={getMessage("source_lang_placeholder")}
          value={sourceLang}
          options={this.sourceLanguageOptions}
          onChange={opt => this.onChange({ sourceLang: opt.value })}
          formatOptionLabel={({ label, value: lang }) => this.formatLanguageLabel({
            lang, sourceType: "source", title: label,
          })}
        />
        <Icon
          material="swap_horiz"
          className="swap-icon"
          title={getMessage("swap_languages")}
          onClick={this.onSwap}
        />
        <ReactSelect
          className="Select"
          classNamePrefix="ReactSelect"
          placeholder={getMessage("target_lang_placeholder")}
          value={targetLang}
          options={this.targetLanguageOptions}
          onChange={opt => this.onChange({ targetLang: opt.value })}
          formatOptionLabel={({ label, value: lang }) => this.formatLanguageLabel({
            lang, sourceType: "target", title: label,
          })}
        />
        {showInfoIcon && (
          <Icon small material="info_outline" tooltip={
            getMessage("favorites_info_tooltip", { hotkey: "Cmd / Alt+Shift" })
          }/>
        )}
      </div>
    );
  }
}

export const langToFlagIconMap: Record<string, string> = {
  "sq": "al", // Albanian
  "hy": "am", // Armenian
  "ce": "ph", // Cebuano (Philippines)
  "bn": "bd", // Bengali (Bangladesh)
  "ny": "mw", // Malawi, Zambia, Mozambique, Zimbabwe
  "cs": "cz", // Czech Republic
  "da": "dk", // Danish
  "en": "gb", // English
  "el": "gr", // Greek
  "ka": "ge", // Georgian
  "ha": "ne", // Hausa (West Africa)
  "haw": "hm", // Hawaiian
  "hi": "in", // Hindi (India)
  "te": "in", // Telugu (India)
  "ur": "pk", // Urdu (Pakistan)
  "ja": "jp", // Japanese
  "ko": "kr", // Korean
  "lo": "la", // Laos
  "uk": "ua", // Ukrainian
  "fa": "ir", // Iran (Persian)
  "ku": "iq", // Iraq, Kurdistan Region
  "ma": "nz", // Maori (New Zealand)
  "sw": "ke", // Swahili (Kenya, Rwanda, Tanzania, Uganda)
  "zh-CN": "cn", // Chinese (Simplified)
  "zh-TW": "tw", // Chinese (Taiwan)
  "yo": "ng", // Yoruba (Nigeria)
  "zu": "za", // Zulu (South Africa)
  "xh": "za", // Xhosa (South Africa)
};

export function getFlagIcon(locale: string): string | undefined {
  try {
    const langIconFile = langToFlagIconMap[locale] ?? locale;
    return require(`flag-icons/flags/4x3/${langIconFile}.svg`);
  } catch (error) {
    return undefined; // noop
  }
}
