Clear-Host
Write-Host "--- DEBUT DU PROCESSUS D'ENVOI ---" -ForegroundColor Magenta
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Erreur : Git n'est pas installe ou pas reconnu." -ForegroundColor Red
    Read-Host "Appuyez sur Entree..."
    exit
}
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Erreur : Vous n'etes pas dans le dossier projet." -ForegroundColor Red
    exit
}
$githubUser = Read-Host "Entrez votre nom d'utilisateur GitHub"
if (-not $githubUser) { exit }
Write-Host "-> Preparation de Git..." -ForegroundColor Cyan
if (-not (Test-Path ".git")) { git init }
git add .
git commit -m "Mise a jour Aerothau Manager"
git branch -M main
Write-Host "-> Connexion a GitHub..." -ForegroundColor Cyan
if (git remote) { git remote remove origin }
git remote add origin "https://github.com/$githubUser/aerothau-manager.git"
Write-Host "-> Envoi vers le serveur... (Une fenetre peut s'ouvrir)" -ForegroundColor Yellow
git push -u origin main --force
if ($LASTEXITCODE -eq 0) {
    Write-Host "----------------------------------------------------" -ForegroundColor Green
    Write-Host "✅ TERMINE ! Votre code est synchronise sur GitHub." -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️ ATTENTION - DERNIERE ETAPE POUR FIXER L'ERREUR 'SETUP PAGES' :" -ForegroundColor Yellow
    Write-Host "1. Allez sur GitHub.com > Settings > Pages" -ForegroundColor White
    Write-Host "2. Dans 'Source', choisissez 'GitHub Actions' au lieu de 'Branch'" -ForegroundColor White
    Write-Host "3. Le déploiement passera alors au VERT." -ForegroundColor White
    Write-Host ""
    Write-Host "Lien final : https://$githubUser.github.io/aerothau-manager/" -ForegroundColor Cyan
} else {
    Write-Host "❌ Erreur de transfert." -ForegroundColor Red
}
Read-Host "Appuyez sur Entree pour quitter..."