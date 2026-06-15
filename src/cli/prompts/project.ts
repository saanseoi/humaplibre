import {
  groupMultiselect,
  group,
  isCancel,
  select,
  text,
} from "@clack/prompts";
import { CliError } from "../../core/errors.ts";
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

export async function promptHumapProjectSelection(projects: string[]): Promise<string> {
  if (projects.length === 1) {
    return projects[0]!;
  }

  const project = await select({
    message: "Select a Humap export project",
    options: projects.map((value) => ({ value, label: value })),
  });

  if (isCancel(project)) {
    throw new CliError("Project selection cancelled.");
  }

  return project;
}

export async function promptCollectionSelection(
  collections: Array<{ value: string; label: string; hint?: string }>,
): Promise<string[]> {
  const values = await groupMultiselect({
    message: "Select collections to export",
    options: {
      "ALL Collections": collections,
    },
    required: true,
  });

  if (isCancel(values)) {
    throw new CliError("Collection selection cancelled.");
  }

  return values as string[];
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
