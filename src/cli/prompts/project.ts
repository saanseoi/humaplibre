import {
  group,
  isCancel,
  select,
  text,
} from "@clack/prompts";
import { CliError } from "../../core/errors.ts";
import type { ExportMode, LayeringMode } from "../../domain/manifest.ts";
import { resolveProjectName } from "../../utils/project.ts";

export async function promptProjectSelection(existingProjects: string[]): Promise<string> {
  if (existingProjects.length > 0) {
    const project = await select({
      message: "Select a project or choose new",
      options: [
        { value: "__new__", label: "New project" },
        ...existingProjects.map((value) => ({ value, label: value })),
      ],
    });

    if (isCancel(project)) {
      throw new CliError("Project selection cancelled.");
    }

    if (project !== "__new__") {
      return project;
    }
  }

  const name = await text({
    message: "Project name",
    placeholder: "cityrecorder-neon",
    validate(value) {
      return resolveProjectName(value) ? undefined : "Use lowercase letters, numbers, and dashes.";
    },
  });

  if (isCancel(name)) {
    throw new CliError("Project selection cancelled.");
  }

  return resolveProjectName(name)!;
}

export async function promptReplaceOrExtend(): Promise<ExportMode> {
  const mode = await select({
    message: "Existing export found. Replace or extend?",
    options: [
      { value: "replace", label: "Replace" },
      { value: "extend", label: "Extend" },
    ],
  });

  if (isCancel(mode)) {
    throw new CliError("Export cancelled.");
  }

  return mode;
}

export async function promptLayeringMode(): Promise<LayeringMode> {
  const mode = await select({
    message: "How should the source maps be stored?",
    options: [
      { value: "same", label: "Combine into one feature collection" },
      { value: "separate", label: "Write separate feature collections" },
    ],
  });

  if (isCancel(mode)) {
    throw new CliError("Export cancelled.");
  }

  return mode;
}

export async function promptMapUrls(): Promise<string[]> {
  const urls = await text({
    message: "Google My Maps URLs",
    placeholder: "Paste one or more URLs separated by commas",
    validate(value) {
      const items = (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return items.length > 0 ? undefined : "At least one URL is required.";
    },
  });

  if (isCancel(urls)) {
    throw new CliError("Export cancelled.");
  }

  return urls
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function promptDuplicatePolicy(): Promise<"replace" | "skip"> {
  const value = await select({
    message: "Duplicate features were found. How should they be handled?",
    options: [
      { value: "replace", label: "Replace duplicate features" },
      { value: "skip", label: "Skip duplicate features" },
      { value: "cancel", label: "Cancel" },
    ],
  });

  if (isCancel(value) || value === "cancel") {
    throw new CliError("Export cancelled.");
  }

  return value;
}

export async function promptLocale(): Promise<string> {
  const locale = await select({
    message: "Select locale",
    options: [
      { value: "en", label: "en" },
      { value: "zh-hant", label: "zh-hant" },
      { value: "zh-hans", label: "zh-hans" },
      { value: "__other__", label: "other" },
    ],
  });

  if (isCancel(locale)) {
    throw new CliError("HYPE export cancelled.");
  }

  if (locale !== "__other__") {
    return locale;
  }

  const customLocale = await text({
    message: "Locale code",
    placeholder: "fr",
    validate(value) {
      return (value ?? "").trim() ? undefined : "Locale is required.";
    },
  });

  if (isCancel(customLocale)) {
    throw new CliError("HYPE export cancelled.");
  }

  return customLocale.trim();
}

export async function promptHypeUser(): Promise<{ email: string; id: string }> {
  const values = await group(
    {
      email: () =>
        text({
          message: "HYPE user email",
          validate(value) {
            return (value ?? "").includes("@") ? undefined : "Enter a valid email.";
          },
        }),
      id: () =>
        text({
          message: "HYPE user ID",
          validate(value) {
            return (value ?? "").trim() ? undefined : "User ID is required.";
          },
        }),
    },
    {
      onCancel() {
        throw new CliError("HYPE export cancelled.");
      },
    },
  );

  return {
    email: values.email.trim(),
    id: values.id.trim(),
  };
}
