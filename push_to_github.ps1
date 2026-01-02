# Script PowerShell pour automatiser l'envoi sur GitHub (Version aerothau-manager)

Clear-Host
Write-Host "--- DEBUT DU PROCESSUS D'ENVOI ---" -ForegroundColor Magenta

# 0. Vérification du dossier projet
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Erreur : Vous n'êtes pas dans la racine du projet (fichier package.json introuvable)." -ForegroundColor Red
    Write-Host "Utilisez 'cd' pour aller dans votre dossier projet avant de lancer le script."
    Read-Host "Appuyez sur Entrée pour quitter..."
    exit
}

# 1. Demander le nom d'utilisateur GitHub
$githubUser = Read-Host "Entrez votre nom d'utilisateur GitHub"
if (-not $githubUser) {
    Write-Host "❌ Erreur : Vous devez entrer un nom d'utilisateur." -ForegroundColor Red
    Read-Host "Appuyez sur Entrée pour quitter..."
    exit
}

# 2. Initialisation Git et commit
Write-Host "-> Vérification de Git..." -ForegroundColor Cyan
if (-not (Test-Path ".git")) {
    Write-Host "-> Initialisation du dépôt local..."
    git init
}

Write-Host "-> Ajout des fichiers..." -ForegroundColor Cyan
git add .

Write-Host "-> Création du point de sauvegarde (commit)..." -ForegroundColor Cyan
git commit -m "Mise à jour Aerothau Manager : Cockpit et Correction UI"

# 3. Configuration de la branche et du lien distant
Write-Host "-> Configuration de la branche 'main'..." -ForegroundColor Cyan
git branch -M main

Write-Host "-> Mise à jour de l'adresse du serveur (GitHub)..." -ForegroundColor Cyan
$remoteExists = git remote | Select-String "origin"
if ($remoteExists) {
    git remote remove origin
}

# Configuration de l'URL vers le dépôt aerothau-manager
git remote add origin "https://github.com/$githubUser/aerothau-manager.git"

# 4. Envoi sur les serveurs
Write-Host "-> Envoi forcé vers GitHub... (Une fenêtre d'authentification peut s'ouvrir)" -ForegroundColor Yellow
git push -u origin main --force

if ($LASTEXITCODE -ne 0) {
    Write-Host "----------------------------------------------------" -ForegroundColor Red
    Write-Host "❌ Une erreur est survenue lors du transfert." -ForegroundColor Red
    Write-Host "Vérifiez que le dépôt 'aerothau-manager' existe bien sur votre compte GitHub." -ForegroundColor Red
} else {
    Write-Host "----------------------------------------------------" -ForegroundColor Green
    Write-Host "✅ Succès ! Votre code est synchronisé sur GitHub." -ForegroundColor Green
    Write-Host "Allez sur GitHub > Onglet 'Actions' pour voir le déploiement." -ForegroundColor Green
}

Write-Host "----------------------------------------------------"
Read-Host "Appuyez sur Entrée pour fermer cette fenêtre..."
