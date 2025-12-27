import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <Sidebar />
            <div className="lg:pl-72 flex flex-col min-h-screen">
                <Header />
                <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 bg-[url('/grid.svg')] bg-fixed bg-center">
                    {children}
                </main>
            </div>
        </div>
    );
}
