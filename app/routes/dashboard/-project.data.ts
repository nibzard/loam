import { useQuery, type ConvexReactClient } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  makeRouteQuerySpec,
  prewarmSpecs,
} from "@/lib/convexRouteData";

export function getProjectEssentialSpecs(params: {
  teamSlug: string;
  projectId: Id<"projects">;
}) {
  return [
    makeRouteQuerySpec(api.workspace.resolveContext, {
      teamSlug: params.teamSlug,
      projectId: params.projectId,
    }),
    makeRouteQuerySpec(api.projects.get, {
      projectId: params.projectId,
    }),
    makeRouteQuerySpec(api.videos.list, {
      projectId: params.projectId,
    }),
  ];
}

// Guards prewarmed project rendering (upstream 8f98027): while the route
// re-resolves, the video list can arrive from a prewarmed query before the
// project document catches up. Data is only consistent when the project
// document belongs to the resolved context, or is definitively missing from
// it. Otherwise consumers would render one project's videos under another
// project's document, or crash on a still-loading document.
export function isProjectDataConsistent(input: {
  resolvedProjectId: Id<"projects"> | undefined;
  project: { _id: Id<"projects"> } | null | undefined;
}): boolean {
  if (input.project === null) {
    // A definitive not-found answer for the requested context.
    return input.resolvedProjectId !== undefined;
  }

  if (!input.resolvedProjectId || !input.project) {
    return false;
  }

  return input.project._id === input.resolvedProjectId;
}

export function useProjectData(params: {
  teamSlug: string;
  projectId: Id<"projects">;
}) {
  const context = useQuery(api.workspace.resolveContext, {
    teamSlug: params.teamSlug,
    projectId: params.projectId,
  });
  const resolvedProjectId = context?.project?._id;
  const resolvedTeamSlug = context?.team.slug ?? params.teamSlug;
  const project = useQuery(
    api.projects.get,
    resolvedProjectId ? { projectId: resolvedProjectId } : "skip",
  );
  const videos = useQuery(
    api.videos.list,
    resolvedProjectId ? { projectId: resolvedProjectId } : "skip",
  );
  const isConsistent = isProjectDataConsistent({ resolvedProjectId, project });

  return {
    context,
    resolvedProjectId,
    resolvedTeamSlug,
    project: isConsistent ? project : undefined,
    videos: isConsistent ? videos : undefined,
  };
}

export async function prewarmProject(
  convex: ConvexReactClient,
  params: {
    teamSlug: string;
    projectId: Id<"projects">;
  },
) {
  prewarmSpecs(convex, getProjectEssentialSpecs(params));
}
