<p align="center">
<img width="320" height="320" alt="GMapLibre Logo" src="https://github.com/user-attachments/assets/8ef74450-af17-445f-9c98-e607eae1f872" />
  <h1 align="center">Liberate your Google Maps</h1>
</p>

`gmaplibre` is a friendly CLI that helps you export your Google Maps while _keeping your images_. 

It is built around a two-step workflow:

1. `gmaplibre`
   Exports one or more Google My Maps URLs into GeoJSON; downloads all associated images.
2. `gmaplibre hype`
   Converts those exports into a [HYPE](https://hype.hk)-ready CSV.

## Common Use Cases

- Archive community-made Google My Maps before links, images, or descriptions change.
- Convert My Maps into a generic GeoJSON dataset that can be reused in other tools.
- Download images referenced in map descriptions and store them locally with stable filenames.
- Merge multiple source maps into one project export; or batch download mulitple maps but keeping their data distinct. 

## HYPE Use Cases

Hype.hk is a public mapping platform in Hong Kong. This tool was developed to port Google Maps over to HYPE. As such, `gmaplibre` helps you to:

- Prepare HYPE import CSVs from a consistent intermediate export.
- Add project-specific HYPE transformation rules with lightweight custom hooks in `custom/{project}/hype.ts`.

## How It Works

### 1. Export to GeoJSON

Run:

```sh
bun run export
```

The CLI will:

- Select or create a project.
- Ask for one or more Google My Maps URLs unless passed with `--url`.
- Decide whether to `replace` or `extend` an existing export.
- Decide whether maps should be combined or kept separate.
- Decide how layers should be handled.
- Resolve each Google My Maps source and extract its KML.
- Convert features into GeoJSON.
- Extract image URLs from each feature description.
- Remove embedded images from the saved plain-text description.
- Download those images into the project’s `images/` folder.
- Write GeoJSON collections plus a `manifest.json`.

### 2. HYPE Export

Run:

```sh
bun run hype
```

The CLI will:

- Load the exported GeoJSON collections for a project.
- Ask for a locale unless passed with `--locale`.
- Ask for HYPE user details unless passed with `--email` and `--user-id`.
- Build a CSV for HYPE import.
- Apply optional project-specific hooks from `custom/{project}/hype.ts`.

## Example Output

```txt
export/{project}/
  maps/
    *.geojson
  images/
    {featureId}-00.jpg
    {featureId}-01.png
  hype/
    {locale}.csv
  manifest.json
```

## CLI

```txt
bun run export [--project <project>] [--mode replace|extend] [--map-mode combine|keepSeparate] [--layer-mode flatten|groupByName|asIs] [--url <url> ...]
bun run hype [--project <project>] [--locale <locale>] [--email <email>] [--user-id <id>]
```

## Project Customization

Project-specific HYPE behavior can be added in:

```txt
custom/{project}/hype.ts
```

Supported hooks:

- `isArchivedFromFeature`
- `isIntangibleFromFeature`
- `isPublishedFromFeature`
- `isVisitableFromFeature`

If a hook is not provided, the default behavior is used.

## Limitations

- This tool was designed primarily to extract images from the Google My Maps description field and preserve the remaining description text in a cleaner form.
- It is not yet a general-purpose extractor for arbitrary structured data hidden inside descriptions or other custom KML content.
- If you have another extraction use case in mind, open an issue describing the source data and desired output.

## Development

Install dependencies:

```sh
bun install
```

Type-check:

```sh
bun run check
```

## Contributing

Public contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).
