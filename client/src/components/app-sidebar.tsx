import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { LayoutDashboard, CalendarDays, ClipboardList, Users, BarChart3, Clock, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const ownerItems = [
  { title: "Suvestinė", url: "/", icon: LayoutDashboard },
  { title: "Dienos planai", url: "/day-plans", icon: CalendarDays },
  { title: "Darbuotojai", url: "/employees", icon: Users },
  { title: "Flex valandos", url: "/flex-hours", icon: Clock },
  { title: "Analitika", url: "/analytics", icon: BarChart3 },
];

const adminItems = [
  { title: "Suvestinė", url: "/", icon: LayoutDashboard },
  { title: "Dienos planai", url: "/day-plans", icon: CalendarDays },
  { title: "Darbuotojai", url: "/employees", icon: Users },
  { title: "Flex valandos", url: "/flex-hours", icon: Clock },
];

const employeeItems = [
  { title: "Mano planas", url: "/", icon: ClipboardList },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const items = user?.role === "owner" ? ownerItems : user?.role === "admin" ? adminItems : employeeItems;

  const initials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || "?";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold text-sm">
            SP
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Sandėlio Planas</span>
            <span className="text-xs text-muted-foreground">Darbo valdymas</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigacija</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild data-active={location === item.url}>
                    <Link href={item.url} data-testid={`nav-${item.url.replace("/", "") || "home"}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || ""} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium truncate">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="text-xs text-muted-foreground capitalize">{user?.role === "owner" ? "Savininkas" : user?.role === "admin" ? "Admin" : "Darbuotojas"}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => { window.location.href = "/api/logout"; }}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
