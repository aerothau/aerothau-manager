Clear-Host
Write-Host "--- DÉBUT DU PROCESSUS D'ENVOI ---" -ForegroundColor Magenta

if (-not (Test-Path "package.json")) {
    Write-Host "❌ Erreur : Vous n'êtes pas dans le dossier projet." -ForegroundColor Red
    exit
}

$githubUser = Read-Host "Entrez votre nom d'utilisateur GitHub"
if (-not $githubUser) { exit }

Write-Host "-> Préparation de Git..." -ForegroundColor Cyan
if (-not (Test-Path ".git")) { git init }
git add .
git commit -m "Mise à jour Aerothau Manager"
git branch -M main

Write-Host "-> Connexion à GitHub..." -ForegroundColor Cyan
if (git remote) { git remote remove origin }
git remote add origin "https://github.com/$githubUser/aerothau-manager.git"

Write-Host "-> Envoi vers le serveur... (Vérifiez si une fenêtre s'ouvre)" -ForegroundColor Yellow
git push -u origin main --force

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ TERMINÉ ! Votre code est en ligne." -ForegroundColor Green
    Write-Host "Lien : https://$githubUser.github.io/aerothau-manager/" -ForegroundColor Cyan
} else {
    Write-Host "❌ Erreur de transfert." -ForegroundColor Red
}
Read-Host "Appuyez sur Entrée pour quitter..."
