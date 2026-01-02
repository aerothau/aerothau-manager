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
    Write-Host "✅ TERMINE ! Votre code est en ligne." -ForegroundColor Green
    Write-Host "Lien : https://$githubUser.github.io/aerothau-manager/" -ForegroundColor Cyan
} else {
    Write-Host "❌ Erreur de transfert." -ForegroundColor Red
}
Read-Host "Appuyez sur Entree pour quitter..."