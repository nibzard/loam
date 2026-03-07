import { createFileRoute } from "@tanstack/react-router";
import HomepageMono from "./-mono";

export const Route = createFileRoute("/mono")({
  component: HomepageMono,
});
