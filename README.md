<p align="center">
<img width="320" height="320" alt="HupapLibre Logo" src="https://github.com/user-attachments/assets/3d8fb9df-709c-469c-a65d-03a583c142d3" />
  <h1 align="center">Liberate your Humaps</h1>
</p>

`humaplibre` is a friendly CLI that processes your [humap](https://humap.me/) into reusable parts. 

## Common Use Cases

- Archive community-made Humaps before links, images, or descriptions change.
- Convert Humaps into a generic GeoJSON dataset that can be reused in other tools.
- Group exported data by their respective maps.

## HYPE Use Cases

Hype.hk is a public mapping platform in Hong Kong. This tool was developed to port Humap exports over to HYPE. As such, `humaplibre` helps you to:

- Prepare HYPE import CSVs from a consistent intermediate export.
- Add project-specific HYPE transformation rules with lightweight custom hooks in `custom/{project}/hype.ts`.

## Install

Clone the repo and install the project

```sh
git clone git@github.com:saanseoi/humaplibre.git && cd humaplibre
bun install
```

## Use

### 0. Ensure exports are enabled on Humap

The export functionality on your Humap instance is disabled by default. You may [contact support](mailto:support@humap.me) with a request to have it enabled. Once it's enabled it's show up as a **Tools > Exports** in your Admin panel at `{HUMAP_DOMAIN}/admin/exports`. 

Note that by default Humap only offers GeoJSON export of the __records__ -- these exports don't export any of the associated media or other details you may have attached to your map.

### 1. Create an export

Click 'Generate Export' in the top right of the view. It'll say 'Export Queued' at the top, and "Running" in the table of exports until it is ready to be downloaded. The delay depends on how large your humap instance is, but it's normal to have to wait a couple of minutes until the export is created. You need to refresh the page to see whether it's completed.

Once it's available, download the export -- it's a zip file, so extract it and put all the contents into the the import folder in the repo you've cloned, i.e. `humaplibre/import`. Your folder structure should look like

<img width="600" alt="image" src="https://github.com/user-attachments/assets/a010c912-bca7-4636-82e3-9d0f8bd3dfc5" />

where `export-humaplibre-20260101-000000` contains all your humap files.


### 2. Export to GeoJSON

A CLI will guide you through the steps of exporting your Google Maps. Run

```sh
bun run process
```

The CLI will help you to

- Select your project.
- Select any number of your collections.
- Merge a record's links and media into GeoJSON.
- Rewrite image names to match the record Id, and sequence number.
- Move those images into the collection’s `images/` folder.
- Write GeoJSON collections plus a `manifest.json`.


### 3. Prepare for HYPE

Optionally, you can use the tool to prepare a map for upload to [HYPE](https://hype.hk). Run:

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
export/
  {project}/
    {collection}/
      {collection}.geojson
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

- This export was only tested against a handful of humaps. There may be unforseen bugs or limitations.
- If you have another extraction use case in mind, open an issue describing the desired process and output.

## Outstanding Items

In order to support the humap exports 100% we still need to understand how the following looks in the data export

- Annotations
- Image Comparisons
- Trails
- IIIF
- Sketchfab
- Figshare
- Record "status" -- what are all the non-published / draft statuses?

If you have maps with any of these features, please let us know as we'd love to see what the exported data looks like!

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
