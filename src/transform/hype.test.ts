import { expect, test } from "bun:test";
import culturalMediaHooks, {
	extractBilingualAddress,
	extractLocalizedTitle,
} from "../../custom/cultural-media-education-foundation/hype.ts";
import type { GenericFeatureCollection } from "../formats/geojson.ts";
import { buildHypeRows } from "./hype.ts";

test("extractBilingualAddress splits English-first address", () => {
	expect(
		extractBilingualAddress("G/F, 10 Park Road, Mid-Levels\n半山柏道10號地舖"),
	).toMatchObject({
		en: "G/F, 10 Park Road, Mid-Levels",
		zhHant: "半山柏道10號地舖",
	});
});

test("extractBilingualAddress keeps shared unit token in both locale addresses", () => {
	expect(
		extractBilingualAddress(
			"香港中環荷李活道89號1A 1A, 89 Hollywood Road, Central, Hong Kong",
		),
	).toMatchObject({
		en: "1A, 89 Hollywood Road, Central, Hong Kong",
		zhHant: "香港中環荷李活道89號1A",
	});
});

test("extractLocalizedTitle splits pipe-delimited names and strips inactive markers", () => {
	expect(
		extractLocalizedTitle(
			"Seeds 兒童書店 (已搬遷) | Seeds Children's Bookstore (moved)",
		),
	).toEqual({
		en: "Seeds Children's Bookstore",
		zhHant: "Seeds 兒童書店",
		isInactive: true,
	});
	expect(extractLocalizedTitle("Flow Bookshop")).toEqual({
		en: "Flow Bookshop",
		zhHant: "Flow Bookshop",
		isInactive: false,
	});
	expect(
		extractLocalizedTitle("Book B (在Common Room & Co.) (已結束)"),
	).toEqual({
		en: "Book B (@Common Room & Co.)",
		zhHant: "Book B (在Common Room & Co.)",
		isInactive: true,
	});
	expect(extractLocalizedTitle("Book B （南豐紗廠）（已結束）")).toEqual({
		en: "Book B (Nanfeng Textile Factory)",
		zhHant: "Book B （南豐紗廠）",
		isInactive: true,
	});
	expect(extractLocalizedTitle("開懷舊書店 （已結束）")).toEqual({
		en: "",
		zhHant: "開懷舊書店",
		isInactive: true,
	});
});

test("extractBilingualAddress extracts bracketed transport notes by locale", () => {
	expect(
		extractBilingualAddress(
			"九龍荔枝角長順街1號新昌工業大廈5樓6室 （荔枝角站A出口） Flat 6, 5/F, Sun Cheong Industrial Building, 1 Cheung Shun Street, Kowloon\n(Lai Chi Kok MTR Exit A)",
		),
	).toMatchObject({
		en: "Flat 6, 5/F, Sun Cheong Industrial Building, 1 Cheung Shun Street, Kowloon",
		zhHant: "九龍荔枝角長順街1號新昌工業大廈5樓6室",
		enDescription: "Lai Chi Kok MTR Exit A",
		zhHantDescription: "荔枝角站A出口",
	});
});

test("extractBilingualAddress translates relocation notes", () => {
	expect(
		extractBilingualAddress(
			"2025.5.7之後的地址 (After 7/5/2025) 荔枝角長順街1號新昌工業大廈5樓6室 Room 6, 5/F, Sun Cheong Industrial Building, Cheung Yee St, Cheung Sha Wan",
		),
	).toMatchObject({
		en: "Room 6, 5/F, Sun Cheong Industrial Building, Cheung Yee St, Cheung Sha Wan",
		zhHant: "荔枝角長順街1號新昌工業大廈5樓6室",
		enDescription: "Relocated here on 2025-05-07",
		zhHantDescription: "2025-05-07之後的地址",
	});
});

test("extractBilingualAddress uses raw HTML line breaks as locale boundaries", () => {
	expect(
		extractBilingualAddress(
			"<div>香港租庇利街17-19號順聯大廈103-106<br>Central, Jubilee St, 17-19號, United Building, 1/F</div>",
		),
	).toMatchObject({
		en: "Central, Jubilee St, 17-19, United Building, 1/F",
		zhHant: "香港租庇利街17-19號順聯大廈103-106",
	});
});

test("extractBilingualAddress cleans Chinese suffixes from English addresses", () => {
	expect(
		extractBilingualAddress(
			"旺角煙廠街9號興發商業大廈5樓502室 Mong Kok, Yin Chong St, 9號5樓502室 Prosper Commercial Building",
		).en,
	).toBe("Mong Kok, Yin Chong St, 9 5/F Rm 502 Prosper Commercial Building");
});

test("extractBilingualAddress extracts historical address ranges into descriptions", () => {
	expect(
		extractBilingualAddress(
			"2025.5.7之後的地址 (After 7/5/2025) 荔枝角長順街1號新昌工業大廈5樓6室 Room 6, 5/F, Sun Cheong Industrial Building, Cheung Yee St, Cheung Sha Wan 2013-2025 中環皇后大道中162號10樓 10/F, On Building, 162 Queen's Road Central, Central",
		),
	).toMatchObject({
		en: "Room 6, 5/F, Sun Cheong Industrial Building, Cheung Yee St, Cheung Sha Wan",
		zhHant: "荔枝角長順街1號新昌工業大廈5樓6室",
		enDescription:
			"Between 2013-2025, located at 10/F, On Building, 162 Queen's Road Central, Central.",
		zhHantDescription: "2013-2025 中環皇后大道中162號10樓",
	});
});

test("extractBilingualAddress translates date and subway notes", () => {
	expect(
		extractBilingualAddress(
			"香港觀塘駿業街60號駿運工業大廈14A（至2022年6月14日） 14A, Tsun Win Factory Building, 60 Tsun Yip St, Kwun Tong （2022年6月16日起至結業）",
		).enDescription,
	).toBe("Until June 14, 2022; from June 16, 2022 until graduation");
	expect(
		extractBilingualAddress(
			"旺角 西洋菜街48號 1樓 (地鐵E2出口) 1/F , 48 Sai Yeung Choi Street South , Mong Kok 旺角 西洋菜南街63號 1樓 (地鐵D3出口, 大快活對面) 1/F , 63 Sai Yeung Choi Street South , Mong Kok",
		).enDescription,
	).toBe("Subway Exit E2/D3, opposite Fairwood");
});

test("buildHypeRows emits one row with locale-qualified columns", () => {
	const collection: GenericFeatureCollection = {
		type: "FeatureCollection",
		id: "test",
		filename: "test.geojson",
		metadata: { collectionName: "Layer" },
		features: [
			{
				type: "Feature",
				geometry: { type: "Point", coordinates: [114.1, 22.3] },
				properties: {
					featureId: "feature-1",
					name: "中環書店 （已結束） | Central Bookshop (Closed)",
					status: "published",
					description:
						"中環 伊利近街 2 號 閣樓 Cockloft, 2 Elgin Street, Central",
					userEmail: "creator@example.com",
				},
			},
		],
	};

	const result = buildHypeRows(
		[collection],
		{ email: "user@example.com" },
		culturalMediaHooks,
		{ layerId: "layer-1" },
	);

	expect(result.rows).toHaveLength(1);
	expect(result.rows[0]).toMatchObject({
		"feature.i18n[locale=en].title": "Central Bookshop",
		"feature.i18n[locale=en].titleGen": "false",
		"feature.i18n[locale=en].rawAddress": "Cockloft, 2 Elgin Street, Central",
		"feature.i18n[locale=zhHant].title": "中環書店",
		"feature.i18n[locale=zhHant].titleGen": "false",
		"feature.i18n[locale=zhHant].rawAddress": "中環 伊利近街 2 號 閣樓",
		"feature.isIntangible": "true",
		"feature.isVisitable": "false",
		"layer.id": "layer-1",
		"layer.name": "Layer",
		"user.email": "creator@example.com",
	});
	expect(result.columns).toContain("feature.i18n[locale=en].rawAddress");
	expect(result.columns).toContain("feature.i18n[locale=zhHant].rawAddress");
	expect(result.columns).not.toContain("feature.i18n[locale=en].featureId");
	expect(result.columns).not.toContain("feature.i18n[locale=zhHant].featureId");
	expect(result.columns).not.toContain("feature.i18n[locale=en].locale");
	expect(result.columns).not.toContain("feature.i18n[locale=zhHant].locale");
	expect(result.columns).not.toContain("feature.published");
	expect(result.columns).not.toContain("addressMeta.latitude");
	expect(result.columns).not.toContain(
		"feature.i18n[locale=en].displayAddress",
	);
});

test("buildHypeRows uses fallback email only when feature lacks creator email", () => {
	const collection: GenericFeatureCollection = {
		type: "FeatureCollection",
		id: "test",
		filename: "test.geojson",
		features: [
			{
				type: "Feature",
				geometry: { type: "Point", coordinates: [114.1, 22.3] },
				properties: {
					featureId: "feature-1",
					name: "Flow Bookshop",
					status: "published",
				},
			},
		],
	};

	const result = buildHypeRows(
		[collection],
		{ email: "fallback@example.com" },
		culturalMediaHooks,
	);

	expect(result.rows[0]?.["user.email"]).toBe("fallback@example.com");
});

test("buildHypeRows applies manual i18n overrides by Humap record ID", () => {
	const collection: GenericFeatureCollection = {
		type: "FeatureCollection",
		id: "test",
		filename: "test.geojson",
		features: [
			{
				type: "Feature",
				geometry: { type: "Point", coordinates: [114.1, 22.3] },
				properties: {
					featureId: "feature-1",
					humapRecordId: 278428,
					name: "Place",
					status: "published",
					description:
						"2025.5.7之後的地址 (After 7/5/2025) 荔枝角長順街1號新昌工業大廈5樓6室 Room 6, 5/F, Sun Cheong Industrial Building, Cheung Yee St, Cheung Sha Wan",
				},
			},
			{
				type: "Feature",
				geometry: { type: "Point", coordinates: [114.2, 22.4] },
				properties: {
					featureId: "feature-2",
					humapRecordId: 308242,
					name: "Beyond the Bubble Studio",
					status: "published",
				},
			},
		],
	};

	const result = buildHypeRows(
		[collection],
		{ email: "fallback@example.com" },
		culturalMediaHooks,
	);

	expect(result.rows[0]).toMatchObject({
		"feature.i18n[locale=en].description":
			"Previously located at Room 6, 5/F, Sun Cheong Industrial Building, Cheung Yee St, Cheung Sha Wan between 2013-2025 when it moved to the new address on 2025-05-07.",
		"feature.i18n[locale=en].rawAddress":
			"10/F, On Building, 162 Queen's Road Central, Central",
		"feature.i18n[locale=zhHant].description":
			"此前，該機構於2013年至2025年間位於長沙灣長義街新昌工業大廈5樓6室，並於2025年5月7日遷至新地址。",
		"feature.i18n[locale=zhHant].rawAddress": "中環皇后大道中162號10樓",
	});
	expect(result.rows[1]).toMatchObject({
		"feature.i18n[locale=en].description":
			'Visit <a href="https://bubble.hk/">Beyond the Bubble Studio</a>',
		"feature.i18n[locale=zhHant].description":
			'<a href="https://bubble.hk/">網址</a>',
		"feature.i18n[locale=en].rawAddress":
			"13B, Justen Centre, 44-52, Wai Ching Street, Jordan, Kowloon",
		"feature.i18n[locale=zhHant].rawAddress":
			"佐敦偉晴街44-52號聯美中心13層B室",
	});
});
