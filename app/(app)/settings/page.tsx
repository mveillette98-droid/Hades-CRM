import { TopBar } from "@/components/layout/top-bar";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata = { title: "Settings — Hades Blueprint CRM" };

export default function SettingsPage() {
  return (
    <>
      <TopBar title="Settings" />
      <main className="flex-1 px-8 py-8">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Profile, pipeline stages, sources, and notifications — wired up
              as the build progresses.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    </>
  );
}
