# GitHub Actions Workflows

## 🎯 Übersicht

Dieses Verzeichnis enthält die CI/CD-Workflows für automatisierte Tests und Deployment.

```
📁 .github/workflows/
├── test.yml         → Automatische Tests bei Push/PR
└── deploy.yml       → Automatisches Deployment (nur nach Tests)
```

---

## 🔄 Workflow-Ablauf

### 1. Test-Workflow (`test.yml`)

```
┌─────────────────────────────────────────┐
│ Push / Pull Request auf 'main'         │
└────────────────┬────────────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ Backend Tests│  │Frontend Tests│
│   (Jest)     │  │  (Vitest)    │
│   44 Tests   │  │   61 Tests   │
└──────┬───────┘  └──────┬───────┘
       │                 │
       └────────┬────────┘
                ▼
        ┌──────────────┐
        │ Test Summary │
        └──────┬───────┘
               │
        ┌──────┴───────┐
        ▼              ▼
    ✅ SUCCESS    ❌ FAILURE
    (PR OK)       (PR blocked)
```

### 2. Deploy-Workflow (`deploy.yml`)

```
┌─────────────────────────┐
│ Push auf 'main'         │
└────────────┬────────────┘
             │
      ┌──────┴──────┐
      ▼             ▼
┌──────────┐  ┌──────────┐
│ Backend  │  │ Frontend │
│  Tests   │  │  Tests   │
└─────┬────┘  └─────┬────┘
      │             │
      └──────┬──────┘
             ▼
      ┌─────────────┐
      │ Tests OK?   │
      └──────┬──────┘
             │
      ┌──────┴──────┐
      ▼             ▼
   ✅ YES        ❌ NO
      │             │
      ▼             ▼
┌──────────┐  ┌──────────┐
│ Firebase │  │Deployment│
│ Deploy   │  │ Blocked  │
└──────────┘  └──────────┘
```

---

## 📋 Jobs im Detail

### Test-Workflow

| Job | Zweck | Dauer | Artifacts |
|-----|-------|-------|-----------|
| `backend-tests` | Jest Tests + ESLint | ~30s | Coverage Report |
| `frontend-tests` | Vitest Tests | ~20s | Test Results |
| `test-summary` | Zusammenfassung | ~5s | - |

### Deploy-Workflow

| Job | Zweck | Dauer | Bedingung |
|-----|-------|-------|-----------|
| `run-tests` | Alle Tests | ~50s | - |
| `deploy` | Firebase Deployment | ~2min | Tests ✅ |
| `deployment-failed` | Fehler-Nachricht | ~5s | Tests ❌ |

---

## ⚙️ Setup

### Schnellstart

1. **Firebase Token generieren:**
   ```bash
   firebase login:ci
   ```

2. **GitHub Secret hinzufügen:**
   - Gehe zu: Repository → Settings → Secrets → New secret
   - Name: `FIREBASE_TOKEN`
   - Value: Der Token von Schritt 1

3. **Workflows aktivieren:**
   ```bash
   git push origin main
   ```

Fertig! 🎉

---

## 📊 Status überwachen

### In GitHub:
- **Actions** Tab → Siehe alle Workflow-Läufe
- **Pull Requests** → Checks bei jedem PR

### Badges im README:
```markdown
![Tests](https://github.com/USERNAME/REPO/actions/workflows/test.yml/badge.svg)
```

---

## 🔧 Troubleshooting

**Tests schlagen in CI fehl, aber lokal funktionieren sie?**
→ Prüfe Node.js-Version (sollte 20 sein)

**Deployment schlägt fehl?**
→ Prüfe `FIREBASE_TOKEN` Secret

**ESLint-Fehler?**
→ `npm run lint --fix`

---

**Mehr Infos:** Siehe [CICD_README.md](../CICD_README.md)
