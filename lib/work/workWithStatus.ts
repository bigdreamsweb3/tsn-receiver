/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { WorkKind, WorkStatus } from "../work-contract";
import type { SnapshotPort, WorkDependencies } from "./dependencies";
export async function workWithStatus(dependencies: Pick<WorkDependencies, "workCollection">, status: WorkStatus | readonly WorkStatus[], kind?: WorkKind) {
    let matching = dependencies.workCollection.where("status", typeof status === "string" ? "==" : "in", status);
    if (kind)
        matching = matching.where("kind", "==", kind);
    const ordered = matching.orderBy("__name__");
    const docs: SnapshotPort[] = [];
    let after: SnapshotPort | undefined;
    while (true) {
        const query = after ? ordered.startAfter(after) : ordered;
        const page = await query.limit(200).get();
        docs.push(...page.docs);
        if (page.docs.length < 200)
            break;
        after = page.docs.at(-1);
    }
    return { docs };
}
