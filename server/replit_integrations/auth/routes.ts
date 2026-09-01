import type { Express } from "express";
import bcrypt from "bcryptjs";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.authType === "email" ? req.user.userId : req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/auth/register", async (req: any, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password || !firstName) {
        return res.status(400).json({ message: "Prašome užpildyti visus privalomus laukus" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Slaptažodis turi būti bent 6 simbolių" });
      }

      const existing = await authStorage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "Šis el. paštas jau užregistruotas" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await authStorage.upsertUser({
        email,
        password: hashedPassword,
        firstName: firstName.trim(),
        lastName: lastName?.trim() || null,
      });

      req.login({ authType: "email", userId: user.id }, (err: any) => {
        if (err) {
          return res.status(500).json({ message: "Registracija pavyko, bet prisijungimas nepavyko" });
        }
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registracijos klaida" });
    }
  });

  app.post("/api/auth/login", async (req: any, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Prašome įvesti el. paštą ir slaptažodį" });
      }

      const user = await authStorage.getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Neteisingas el. paštas arba slaptažodis" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Neteisingas el. paštas arba slaptažodis" });
      }

      req.login({ authType: "email", userId: user.id }, (err: any) => {
        if (err) {
          return res.status(500).json({ message: "Prisijungimo klaida" });
        }
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Prisijungimo klaida" });
    }
  });

  app.post("/api/auth/logout", (req: any, res) => {
    req.logout(() => {
      res.json({ success: true });
    });
  });
}
