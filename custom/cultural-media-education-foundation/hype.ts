import type {
	HypeHookContext,
	HypeHooks,
	HypeLocaleFields,
} from "../../src/custom/hooks.ts";
import type { GenericFeatureCollection } from "../../src/formats/geojson.ts";

const HYPE_LOCALES = ["en", "zhHant"] as const;
type HypeLocale = (typeof HYPE_LOCALES)[number];
type Feature = GenericFeatureCollection["features"][number];

export function i18nFromFeature(
	feature: Feature,
	locale: string,
	_context: HypeHookContext,
): Partial<HypeLocaleFields> {
	if (!isHypeLocale(locale)) {
		return {};
	}

	const title = extractLocalizedTitle(stringifyValue(feature.properties.name));
	const address = extractBilingualAddress(
		stringifyValue(feature.properties.descriptionRaw) ||
			stringifyValue(feature.properties.rawAddress) ||
			stringifyValue(feature.properties.description),
	);
	const defaults = localizedFields(feature, locale, title, address);
	const manual = manualI18nOverride(feature, locale);

	return { ...defaults, ...manual };
}

export function isIntangibleFromFeature(feature: Feature): boolean {
	return extractLocalizedTitle(stringifyValue(feature.properties.name))
		.isInactive;
}

export function isVisitableFromFeature(feature: Feature): boolean {
	return !extractLocalizedTitle(stringifyValue(feature.properties.name))
		.isInactive;
}

const hooks: HypeHooks = {
	i18nFromFeature,
	isIntangibleFromFeature,
	isVisitableFromFeature,
};

export default hooks;

function localizedFields(
	_feature: Feature,
	locale: HypeLocale,
	title: LocalizedTitle,
	address: BilingualAddress,
): Partial<HypeLocaleFields> {
	const isEnglish = locale === "en";
	const localizedTitle = isEnglish ? title.en : title.zhHant;
	const description = isEnglish
		? address.enDescription
		: address.zhHantDescription;

	return {
		title: localizedTitle,
		titleGen: localizedTitle ? "false" : "",
		description,
		descriptionGen: description ? "false" : "",
		rawAddress: isEnglish ? address.en : address.zhHant,
	};
}

function isHypeLocale(value: string): value is HypeLocale {
	return HYPE_LOCALES.includes(value as HypeLocale);
}

interface LocalizedTitle {
	en: string;
	zhHant: string;
	isInactive: boolean;
}

export function extractLocalizedTitle(value: string): LocalizedTitle {
	if (/[|｜]/u.test(value)) {
		const parts = value
			.split(/\s*[|｜]\s*/u)
			.map((part) => stripLifecycleMarkers(part))
			.filter((part) => part.text);
		const isInactive = parts.some((part) => part.isInactive);
		const zhPart = parts.find((part) => hasCjk(part.text));
		const enPart = parts.find((part) => !hasCjk(part.text));
		return {
			en: enPart ? normalizeEnglishTitle(enPart.text) : "",
			zhHant: zhPart?.text ?? enPart?.text ?? "",
			isInactive,
		};
	}

	const stripped = stripLifecycleMarkers(value);
	const isEnglish = startsWithLatin(stripped.text);
	const englishTitle = normalizeEnglishTitle(stripped.text);
	return {
		en: isEnglish ? englishTitle : "",
		zhHant: stripped.text,
		isInactive: stripped.isInactive,
	};
}

function stripLifecycleMarkers(value: string): {
	text: string;
	isInactive: boolean;
} {
	let isInactive = false;
	const text = value
		.replace(
			/[（(]\s*(已結業|已結束|結束|已搬遷|Closed|CLOSED|moved)\s*[）)]/giu,
			() => {
				isInactive = true;
				return "";
			},
		)
		.replace(/\s+/g, " ")
		.trim();

	return { text, isInactive };
}

function normalizeEnglishTitle(value: string): string {
	return titleCaseEnglish(
		value
			.replace(/[（(]\s*南豐紗廠\s*[）)]/gu, "(Nanfeng Textile Factory)")
			.replace(/在(?=[A-Za-z])/gu, "@")
			.replace(/\s+/g, " ")
			.trim(),
	);
}

function titleCaseEnglish(value: string): string {
	return value.replace(/\p{L}[\p{L}'’.-]*/gu, (word) => {
		if (hasCjk(word) || /^[A-Z0-9&.]+$/u.test(word)) {
			return word;
		}
		return word
			.split(/(-)/u)
			.map((part) =>
				part === "-"
					? part
					: part.charAt(0).toLocaleUpperCase("en-US") +
						part.slice(1).toLocaleLowerCase("en-US"),
			)
			.join("");
	});
}

interface BilingualAddress {
	en: string;
	zhHant: string;
	enDescription: string;
	zhHantDescription: string;
}

export function extractBilingualAddress(value: string): BilingualAddress {
	const notes: Array<{ text: string; language: "en" | "zh" }> = [];
	let text = htmlToAddressText(value)
		.replace(/(?:^|\s)(?:Address|地址)[:：]\s*/giu, " ")
		.replace(/[ \t]+/g, " ")
		.trim();

	text = text.replace(
		/(\d{4})[./-](\d{1,2})[./-](\d{1,2})之後的地址/gu,
		(_match, year: string, month: string, day: string) => {
			const date = formatDate(year, month, day);
			notes.push({ text: `${date}之後的地址`, language: "zh" });
			notes.push({ text: `Relocated here on ${date}`, language: "en" });
			return " ";
		},
	);

	text = text
		.replace(/[（(]([^()（）]+)[）)]/gu, (_match, inner: string) => {
			notes.push(...normalizeNotes(inner));
			return " ";
		})
		.replace(/[ \t]+/g, " ")
		.trim();

	const historical = extractHistoricalAddress(text);
	if (historical) {
		text = historical.remaining;
		notes.push({ text: historical.enDescription, language: "en" });
		notes.push({ text: historical.zhHantDescription, language: "zh" });
		for (let index = notes.length - 1; index >= 0; index -= 1) {
			if (
				/^Relocated here on /u.test(notes[index]?.text) ||
				/^\d{4}-\d{2}-\d{2}之後的地址$/u.test(notes[index]?.text)
			) {
				notes.splice(index, 1);
			}
		}
	}

	const split = splitBilingualText(text);
	const zhNotes = uniqueValues(
		notes.filter((note) => note.language === "zh").map((note) => note.text),
	);
	const enNotes = uniqueValues(
		notes.filter((note) => note.language === "en").map((note) => note.text),
	);

	return {
		en: cleanEnglishAddress(split.en),
		zhHant: split.zhHant,
		enDescription: normalizeEnglishDescription(enNotes),
		zhHantDescription: zhNotes.join(" "),
	};
}

function manualI18nOverride(
	feature: Feature,
	locale: HypeLocale,
): Partial<HypeLocaleFields> {
	const humapRecordId = Number(feature.properties.humapRecordId);
	const override = MANUAL_I18N_OVERRIDES[humapRecordId];
	if (!override) {
		return {};
	}

	return override[locale] ?? {};
}

const MANUAL_I18N_OVERRIDES: Record<
	number,
	Partial<Record<HypeLocale, Partial<HypeLocaleFields>>>
> = {
	278297: {
		en: {
			description:
				"Previously located at 14A, Tsun Win Factory Building, 60 Tsun Yip St, Kwun Tong, until 2022-06-14 when it moved to 12C, Wing Cheung Industrial Building, 109 How Ming St, Kwun Tong, where it operated from 2022-06-16 to 2024-06-01",
		},
		zhHant: {
			description:
				"該機構原址位於觀塘淳業街60號淳榮工廠大廈14A室，直至2022年6月14日遷至觀塘昊明街109號永昌工業大廈12C室，並於2022年6月16日至2024年6月1日期間在此經營。",
		},
	},
	278428: {
		en: {
			description:
				"Previously located at Room 6, 5/F, Sun Cheong Industrial Building, Cheung Yee St, Cheung Sha Wan between 2013-2025 when it moved to the new address on 2025-05-07.",
			rawAddress: "10/F, On Building, 162 Queen's Road Central, Central",
		},
		zhHant: {
			description:
				"此前，該機構於2013年至2025年間位於長沙灣長義街新昌工業大廈5樓6室，並於2025年5月7日遷至新地址。",
			rawAddress: "中環皇后大道中162號10樓",
		},
	},
	278260: {
		en: {
			description:
				"Previously also located at Rm 2203, Richmond Commercial Building, 109號 Argyle Street, Mong Kok, Kowloon when it moved to its last address in 2016.",
			rawAddress: "2A, 63 Sai Yeung Choi Street, Mong Kok, Kowloon",
		},
		zhHant: {
			description:
				"旺角亞皆老街107-111號皆旺商業大廈2203室（2016後搬到此地址）。",
			rawAddress: "旺角西洋菜街63號2樓A",
		},
	},
	278261: {
		en: {
			description:
				"It also had a location on 1/F , 63 Sai Yeung Choi Street South , Mong Kok , Kowloon",
			rawAddress: "1/F , 48 Sai Yeung Choi Street South , Mong Kok , Kowloon",
		},
		zhHant: {
			description: "旺角 西洋菜南街63號 1樓 (地鐵D3出口, 大快活對面)",
			rawAddress: "旺角 西洋菜街48號 1樓",
		},
	},
	278407: {
		en: {
			description:
				"During their prime, the had 3 additional branches:<br> - M/F, 5 Sharp Street East, Causeway Bay, Hong Kong  <br> - 2B, Merlin Building, 30-34 Cochrane St, Central <br> - 2/F, 52-52 Haiphong Road, Tsim Sha Tsui",
			rawAddress: "2/F, 61 Sai Yeung Choi Street South, Mong Kok, Kowloon",
		},
		zhHant: {
			description:
				"高峰時期另有3分店:<br> -香港銅鑼灣霎東街5號閣樓  <br> -香港中環閣麟街30-34號二樓b座  <br> - 九龍尖沙咀海防道51－52號2字樓",
			rawAddress: "九龍旺角西洋菜街61號2樓",
		},
	},
	278224: {
		en: {
			description:
				"It run three branches, including Yuen Long, Causeway Bay and Tai Po.",
			rawAddress: "604, President Commercial Centre, 608 Nathan Rd, Mong Kok",
		},
		zhHant: {
			description: "高峰期另有三家分店，包括元朗、銅鑼灣及大埔。",
			rawAddress: "彌敦道608號 總統商業大廈 604室",
		},
	},
	308242: {
		en: {
			description:
				'Visit <a href="https://bubble.hk/">Beyond the Bubble Studio</a>',
			rawAddress:
				"13B, Justen Centre, 44-52, Wai Ching Street, Jordan, Kowloon",
		},
		zhHant: {
			description: '<a href="https://bubble.hk/">網址</a>',
			rawAddress: "佐敦偉晴街44-52號聯美中心13層B室",
		},
	},
};

function htmlToAddressText(value: string): string {
	return value
		.replace(/<br\s*\/?>/giu, "\n")
		.replace(/<\/(?:div|p|li|section|article|h[1-6])>/giu, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/\r\n?/g, "\n")
		.replace(/[ \t]*\n[ \t]*/g, "\n")
		.trim();
}

function extractHistoricalAddress(value: string): {
	remaining: string;
	enDescription: string;
	zhHantDescription: string;
} | null {
	const match = value.match(/^(.*?)(\d{4})-(\d{4})\s+(.+)$/u);
	if (!match) {
		return null;
	}

	const [, remaining = "", startYear = "", endYear = "", historicalText = ""] =
		match;
	const split = splitBilingualText(historicalText);
	if (!split.en && !split.zhHant) {
		return null;
	}

	return {
		remaining: remaining.trim(),
		enDescription: `Between ${startYear}-${endYear}, located at ${split.en}.`,
		zhHantDescription: `${startYear}-${endYear} ${split.zhHant}`,
	};
}

function splitBilingualText(text: string): { en: string; zhHant: string } {
	const lines = text
		.split(/\n+/u)
		.map((line) => cleanAddressPart(line))
		.filter(Boolean);
	if (lines.length === 2) {
		const [first, second] = lines;
		if (first && second && startsWithCjk(first) && startsWithLatin(second)) {
			return { zhHant: first, en: second };
		}
		if (first && second && startsWithLatin(first) && startsWithCjk(second)) {
			return { en: first, zhHant: second };
		}
	}

	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return { en: "", zhHant: "" };
	}

	const zhRanges = [...normalized.matchAll(/\p{Script=Han}+/gu)].map(
		(match) => ({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
		}),
	);

	if (zhRanges.length === 0) {
		return { en: normalized, zhHant: "" };
	}

	const firstZh = zhRanges[0]?.start;
	const lastZh = zhRanges[zhRanges.length - 1]?.end;
	const startsWithZh =
		firstZh < firstLatinIndex(normalized) || firstLatinIndex(normalized) === -1;

	if (!startsWithZh && lastZh > firstZh) {
		return cleanSplitParts(
			normalized.slice(0, firstZh),
			normalized.slice(firstZh),
		);
	}

	const boundary = findZhToEnglishBoundary(normalized, lastZh);
	return cleanSplitParts(
		normalized.slice(boundary.zhStart, boundary.enStart),
		normalized.slice(boundary.enStart),
	);
}

function findZhToEnglishBoundary(
	text: string,
	fallbackEnd: number,
): { zhStart: number; enStart: number } {
	const prefix = text.slice(0, fallbackEnd);
	const prefixBoundary = prefix.match(
		/\s+(?=(?:\d+\/?F|Room|Rm|Shop|Flat|G\/F|M\/F|Cockloft|Basement|No\.?|UG)\b|[A-Z][A-Za-z&.,'’/-]*(?:\s|,|$))/u,
	);
	if (prefixBoundary?.index !== undefined) {
		return { zhStart: 0, enStart: prefixBoundary.index };
	}

	const suffix = text.slice(fallbackEnd);
	const repeatedToken = suffix.match(/^(\s*[A-Za-z0-9]+)\s+\1(?=[,\s])/u);
	if (repeatedToken) {
		return { zhStart: 0, enStart: fallbackEnd + repeatedToken[1]?.length };
	}

	const boundary = suffix.match(
		/\s+(?=(?:\d+\/?F|Room|Rm|Shop|Flat|G\/F|M\/F|Cockloft|Basement|No\.?|UG)\b|[A-Za-z](?:[A-Za-z&.,'’/-]|\s)*\d)/u,
	);
	if (boundary?.index !== undefined) {
		return { zhStart: 0, enStart: fallbackEnd + boundary.index };
	}

	return { zhStart: 0, enStart: fallbackEnd };
}

function cleanSplitParts(
	first: string,
	second: string,
): {
	en: string;
	zhHant: string;
} {
	const left = cleanAddressPart(first);
	const right = cleanAddressPart(second);
	if (startsWithCjk(left) && startsWithLatin(right)) {
		return { zhHant: left, en: right };
	}
	if (startsWithLatin(left) && startsWithCjk(right)) {
		return { en: left, zhHant: right };
	}

	const leftHasZh = hasCjk(left);
	const rightHasZh = hasCjk(right);

	if (leftHasZh && !rightHasZh) {
		return { zhHant: left, en: right };
	}
	if (!leftHasZh && rightHasZh) {
		return { en: left, zhHant: right };
	}

	return { zhHant: leftHasZh ? left : "", en: rightHasZh ? left : right };
}

function cleanAddressPart(value: string): string {
	return value
		.replace(/^[,，、\s]+|[,，、\s]+$/gu, "")
		.replace(/\s+([,，.])/g, "$1")
		.replace(/\s+/g, " ")
		.trim();
}

function cleanEnglishAddress(value: string): string {
	return value
		.replace(/(\d+(?:-\d+)?)號(?=\d+樓)/gu, "$1 ")
		.replace(/(\d+(?:-\d+)?)號(?=\s*,?\s*[A-Za-z])/gu, "$1")
		.replace(/(\d+)樓/gu, "$1/F")
		.replace(/(\d+)\s*室/gu, "Rm $1")
		.replace(/\/F(?=Rm\b)/gu, "/F ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeNotes(
	value: string,
): Array<{ text: string; language: "en" | "zh" }> {
	const text = value.trim();
	if (!text) {
		return [];
	}

	const relocatedDate = text.match(
		/^(?:After\s*)?(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:之後的地址)?$/iu,
	);
	if (relocatedDate) {
		const date = formatDate(
			relocatedDate[1]!,
			relocatedDate[2]!,
			relocatedDate[3]!,
		);
		return hasCjk(text)
			? [
					{ text: `${date}之後的地址`, language: "zh" },
					{ text: `Relocated here on ${date}`, language: "en" },
				]
			: [{ text: `Relocated here on ${date}`, language: "en" }];
	}

	const relocatedDayMonthYear = text.match(
		/^After\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/iu,
	);
	if (relocatedDayMonthYear) {
		const date = formatDate(
			relocatedDayMonthYear[3]!,
			relocatedDayMonthYear[2]!,
			relocatedDayMonthYear[1]!,
		);
		return [{ text: `Relocated here on ${date}`, language: "en" }];
	}

	const relocatedYear = text.match(/^(\d{4})\s*後搬到此地址$/u);
	if (relocatedYear) {
		return [
			{ text: `${relocatedYear[1]}後搬到此地址`, language: "zh" },
			{ text: `Relocated here in ${relocatedYear[1]}`, language: "en" },
		];
	}

	if (/moved to this address in\s*(\d{4})/iu.test(text)) {
		const year = text.match(/(\d{4})/u)?.[1] ?? "";
		return [{ text: `Relocated here in ${year}`, language: "en" }];
	}

	const untilDate = text.match(/^至\s*(\d{4})年(\d{1,2})月(\d{1,2})日$/u);
	if (untilDate) {
		return [
			{
				text: `Until ${formatEnglishDate(untilDate[1]!, untilDate[2]!, untilDate[3]!)}`,
				language: "en",
			},
			{ text, language: "zh" },
		];
	}

	const fromUntilClosure = text.match(
		/^(\d{4})年(\d{1,2})月(\d{1,2})日起至結業$/u,
	);
	if (fromUntilClosure) {
		return [
			{
				text: `from ${formatEnglishDate(fromUntilClosure[1]!, fromUntilClosure[2]!, fromUntilClosure[3]!)} until graduation`,
				language: "en",
			},
			{ text, language: "zh" },
		];
	}

	const subwayExit = text.match(
		/^地鐵\s*([A-Z]\d+)\s*出口(?:,\s*大快活對面)?$/u,
	);
	if (subwayExit) {
		const oppositeFairwood = /大快活對面/u.test(text);
		return [
			{
				text: `Subway Exit ${subwayExit[1]}${oppositeFairwood ? ", opposite Fairwood" : ""}`,
				language: "en",
			},
			{ text, language: "zh" },
		];
	}

	return [{ text, language: hasCjk(text) ? "zh" : "en" }];
}

function formatDate(year: string, month: string, day: string): string {
	return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function formatEnglishDate(year: string, month: string, day: string): string {
	const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
	return new Intl.DateTimeFormat("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(date);
}

function normalizeEnglishDescription(values: string[]): string {
	const subway = values.filter((value) => value.startsWith("Subway Exit "));
	const others = values.filter((value) => !value.startsWith("Subway Exit "));
	if (subway.length > 1) {
		const exits = subway
			.map((value) => value.match(/^Subway Exit ([A-Z]\d+)/u)?.[1])
			.filter((value): value is string => Boolean(value));
		const hasFairwood = subway.some((value) =>
			value.includes("opposite Fairwood"),
		);
		others.push(
			`Subway Exit ${exits.join("/")}${hasFairwood ? ", opposite Fairwood" : ""}`,
		);
	} else {
		others.push(...subway);
	}

	return others.join("; ");
}

function uniqueValues(values: string[]): string[] {
	return [...new Set(values)];
}

function firstLatinIndex(value: string): number {
	const match = value.match(/[A-Za-z]/u);
	return match?.index ?? -1;
}

function startsWithLatin(value: string): boolean {
	return /^[^A-Za-z\p{Script=Han}]*[A-Za-z]/u.test(value);
}

function startsWithCjk(value: string): boolean {
	return /^[^A-Za-z\p{Script=Han}]*\p{Script=Han}/u.test(value);
}

function hasCjk(value: string): boolean {
	return /\p{Script=Han}/u.test(value);
}

function stringifyValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		return value
			.map((entry) => stringifyValue(entry))
			.filter(Boolean)
			.join("; ");
	}
	return JSON.stringify(value);
}
