import { useLayoutEffect } from "react";
import { GitBranch, GitCommit, GitFork, FileText } from "lucide-react";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Card } from "@/components/ui/card";
import { Typography } from "@/components/NouiTypography";
import { useGitStatus } from "@/hooks/useGitStatus";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  M: "text-amber-400",
  A: "text-emerald-400",
  D: "text-rose-400",
  R: "text-sky-400",
  C: "text-violet-400",
  U: "text-orange-400",
  "?": "text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  U: "unmerged",
  "?": "untracked",
};

export default function WorkspacePage() {
  const { data, error } = useGitStatus();
  const { t } = useI18n();
  const { setTitle } = usePageHeader();

  // Set the page title when the component mounts
  useLayoutEffect(() => {
    setTitle(t.app.nav.workspace ?? "Workspace");
  }, [setTitle, t]);

  const isLoading = data === null && error === null;

  if (isLoading) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
        <Card className="px-6 py-4 text-sm text-muted-foreground">
          {error}
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      {/* Header: workspace path + git info */}
      <Card className="flex flex-col gap-3 px-4 py-3">
        <Typography
          mondwest
          className="text-xs uppercase tracking-wider text-muted-foreground"
        >
          workspace
        </Typography>

        <div className="flex items-center gap-1.5 text-xs">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <code className="truncate text-muted-foreground/80">
            {data.workspace_path}
          </code>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {data.is_git_repo ? (
            <>
              <div className="flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-midground" />
                <span className="font-medium text-midground">{data.branch}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <GitCommit className="h-3.5 w-3.5 shrink-0 text-midground/70" />
                <code className="text-midground/70">{data.commit}</code>
              </div>

              <div className="flex items-center gap-1.5">
                <GitFork className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {data.files.length}{" "}
                  {data.files.length === 1 ? "change" : "changes"}
                </span>
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">not a git repository</span>
          )}
        </div>
      </Card>

      {/* File list with git status badges */}
      {data.is_git_repo && (
        <Card className="flex min-h-0 flex-1 flex-col px-0 py-0">
          {data.files.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <GitFork className="h-8 w-8 opacity-40" />
              <Typography
                mondwest
                className="text-xs uppercase tracking-wider"
              >
                clean working tree
              </Typography>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-current/5">
              {/* Column headers */}
              <div className="flex items-center gap-2 px-4 py-2 text-[0.6rem] uppercase tracking-[0.15em] text-muted-foreground/50">
                <span className="w-7 shrink-0 text-center">status</span>
                <span className="flex-1">file</span>
              </div>

              {/* File rows */}
              {data.files.map((file, i) => (
                <div
                  key={`${file.path}-${i}`}
                  className="flex items-center gap-2 px-4 py-2 transition-colors hover:bg-midground/5"
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-7 shrink-0 items-center justify-center rounded-[2px] text-[0.65rem] font-bold uppercase tracking-wider",
                      STATUS_COLORS[file.status] ?? "text-muted-foreground",
                      file.staged &&
                        "bg-midground/10 ring-1 ring-midground/20",
                    )}
                    title={STATUS_LABELS[file.status] ?? file.status}
                  >
                    {file.status}
                  </span>

                  <code className="flex-1 truncate text-xs text-muted-foreground/80">
                    {file.path}
                  </code>

                  {file.staged && (
                    <span className="shrink-0 text-[0.55rem] uppercase tracking-wider text-emerald-400/60">
                      staged
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
