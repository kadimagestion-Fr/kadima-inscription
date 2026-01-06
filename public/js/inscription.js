/**
 * KADIMA - Formulaire d'inscription multi-étapes
 * Yéshiva Yéchouot Yossef - Session 2026-2027
 */

(function () {
    'use strict';

    // ===== Configuration =====
    const CONFIG = {
        totalSteps: 7,
        maxFileSize: 5 * 1024 * 1024, // 5 Mo
        allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        apiEndpoint: '/api/inscription' // À configurer selon le backend
    };

    // ===== État du formulaire =====
    let currentStep = 1;
    let formData = {};
    let uploadedFiles = {};

    // ===== Sélecteurs DOM =====
    const form = document.getElementById('inscriptionForm');
    const sections = document.querySelectorAll('.form-section');
    const stepIndicators = document.querySelectorAll('.step-indicator');
    const progressLine = document.getElementById('progressLine');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    const formNavigation = document.getElementById('formNavigation');

    // ===== Initialisation =====
    function init() {
        setupEventListeners();
        setupConditionalFields();
        setupFileUploads();
        setupFratrieCounter();
        setupIndicatifAutre();
        setupRepresentantsLegaux();
        setDefaultDate();
        updateNavigation();
    }

    // ===== Event Listeners =====
    function setupEventListeners() {
        // Navigation
        prevBtn.addEventListener('click', () => navigate(-1));
        nextBtn.addEventListener('click', () => navigate(1));

        // Soumission
        form.addEventListener('submit', handleSubmit);

        // Validation en temps réel
        form.querySelectorAll('input, select, textarea').forEach(field => {
            field.addEventListener('blur', () => validateField(field));
            field.addEventListener('input', () => {
                if (field.closest('.form-group').classList.contains('has-error')) {
                    validateField(field);
                }
            });
        });
    }

    // ===== Navigation entre les étapes =====
    function navigate(direction) {
        const newStep = currentStep + direction;

        // Validation avant d'avancer
        if (direction > 0 && !validateCurrentSection()) {
            showValidationError();
            return;
        }

        if (newStep >= 1 && newStep <= CONFIG.totalSteps) {
            currentStep = newStep;
            showSection(currentStep);
            updateProgress();
            updateNavigation();

            // Mise à jour du récapitulatif à la dernière étape
            if (currentStep === CONFIG.totalSteps) {
                updateSummary();
            }

            // Scroll vers le haut
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function showSection(step) {
        sections.forEach(section => {
            const sectionStep = parseInt(section.dataset.section);
            section.classList.toggle('active', sectionStep === step);
        });
    }

    function updateProgress() {
        // Mise à jour des indicateurs
        stepIndicators.forEach(indicator => {
            const step = parseInt(indicator.dataset.step);
            indicator.classList.remove('active', 'completed');

            if (step < currentStep) {
                indicator.classList.add('completed');
            } else if (step === currentStep) {
                indicator.classList.add('active');
            }
        });

        // Mise à jour de la barre de progression
        const progressPercent = ((currentStep - 1) / (CONFIG.totalSteps - 1)) * 100;
        progressLine.style.width = `${progressPercent}%`;
    }

    function updateNavigation() {
        // Bouton Précédent
        prevBtn.style.visibility = currentStep === 1 ? 'hidden' : 'visible';

        // Boutons Suivant / Soumettre
        if (currentStep === CONFIG.totalSteps) {
            nextBtn.style.display = 'none';
            submitBtn.style.display = 'inline-flex';
        } else {
            nextBtn.style.display = 'inline-flex';
            submitBtn.style.display = 'none';
        }
    }

    // ===== Validation =====
    function validateCurrentSection() {
        const currentSection = document.querySelector(`.form-section[data-section="${currentStep}"]`);
        const requiredFields = currentSection.querySelectorAll('[required]');
        let isValid = true;

        requiredFields.forEach(field => {
            // Ignorer les champs conditionnels cachés
            if (field.closest('.conditional-field') &&
                !field.closest('.conditional-field').classList.contains('visible')) {
                return;
            }

            if (!validateField(field)) {
                isValid = false;
            }
        });

        return isValid;
    }

    function validateField(field) {
        const formGroup = field.closest('.form-group');
        if (!formGroup) return true;

        let isValid = true;
        const value = field.value.trim();

        // Champ requis
        if (field.hasAttribute('required')) {
            if (field.type === 'file') {
                isValid = uploadedFiles[field.name] !== undefined;
            } else if (field.type === 'checkbox') {
                isValid = field.checked;
            } else {
                isValid = value !== '';
            }
        }

        // Validation email
        if (field.type === 'email' && value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            isValid = emailRegex.test(value);
        }

        // Mise à jour visuelle
        formGroup.classList.toggle('has-error', !isValid);
        field.classList.toggle('error', !isValid);
        field.classList.toggle('success', isValid && value !== '');

        return isValid;
    }

    function showValidationError() {
        // Scroll vers le premier champ en erreur
        const firstError = document.querySelector('.form-group.has-error');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const input = firstError.querySelector('input, select, textarea');
            if (input) input.focus();
        }
    }

    // ===== Champs conditionnels =====
    function setupConditionalFields() {
        // Nationalité israélienne
        document.querySelectorAll('input[name="nationaliteIsrael"]').forEach(radio => {
            radio.addEventListener('change', function () {
                const dateField = document.getElementById('dateNatIsrael');
                dateField.classList.toggle('visible', this.value === 'oui');
            });
        });

        // Nationalité "Autre"
        const nationaliteSelect = document.getElementById('nationalite');
        nationaliteSelect.addEventListener('change', function () {
            const autreField = document.getElementById('autreNationaliteField');
            const autreInput = document.getElementById('autreNationalite');
            const isAutre = this.value === 'autre';

            autreField.classList.toggle('visible', isAutre);
            if (isAutre) {
                autreInput.setAttribute('required', '');
            } else {
                autreInput.removeAttribute('required');
            }
        });

        // Bourse COBY
        document.querySelectorAll('input[name="demandeCoby"]').forEach(radio => {
            radio.addEventListener('change', function () {
                const cobyFields = document.getElementById('cobyFields');
                cobyFields.classList.toggle('visible', this.value === 'oui');
            });
        });

        // Bourse MASSA
        document.querySelectorAll('input[name="demandeMassa"]').forEach(radio => {
            radio.addEventListener('change', function () {
                document.getElementById('massaFields').classList.toggle('visible', this.value === 'oui');
            });
        });

        // Bourse TEVMI
        document.querySelectorAll('input[name="demandeTevmi"]').forEach(radio => {
            radio.addEventListener('change', function () {
                document.getElementById('tevmiFields').classList.toggle('visible', this.value === 'oui');
            });
        });

        // Allergies
        document.querySelectorAll('input[name="allergies"]').forEach(radio => {
            radio.addEventListener('change', function () {
                const detailsField = document.getElementById('allergiesDetails');
                const precisions = document.getElementById('allergiesPrecisions');
                const isOui = this.value === 'oui';

                detailsField.classList.toggle('visible', isOui);
                if (isOui) {
                    precisions.setAttribute('required', '');
                } else {
                    precisions.removeAttribute('required');
                }
            });
        });

        // Traitement médical
        document.querySelectorAll('input[name="traitementMedical"]').forEach(radio => {
            radio.addEventListener('change', function () {
                const detailsField = document.getElementById('traitementDetails');
                const precisions = document.getElementById('traitementPrecisions');
                const isOui = this.value === 'oui';

                detailsField.classList.toggle('visible', isOui);
                if (isOui) {
                    precisions.setAttribute('required', '');
                } else {
                    precisions.removeAttribute('required');
                }
            });
        });

        // Suivi psy
        document.querySelectorAll('input[name="suiviPsy"]').forEach(radio => {
            radio.addEventListener('change', function () {
                const detailsField = document.getElementById('psyDetails');
                const precisions = document.getElementById('psyPrecisions');
                const isOui = this.value === 'oui';

                detailsField.classList.toggle('visible', isOui);
                if (isOui) {
                    precisions.setAttribute('required', '');
                } else {
                    precisions.removeAttribute('required');
                }
            });
        });
    }

    // ===== Upload de fichiers =====
    function setupFileUploads() {
        document.querySelectorAll('.file-upload').forEach(uploadZone => {
            const input = uploadZone.querySelector('input[type="file"]');
            const fieldName = uploadZone.dataset.field;

            // Clic sur la zone
            uploadZone.addEventListener('click', () => input.click());

            // Drag & Drop
            uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadZone.classList.add('dragover');
            });

            uploadZone.addEventListener('dragleave', () => {
                uploadZone.classList.remove('dragover');
            });

            uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadZone.classList.remove('dragover');

                const file = e.dataTransfer.files[0];
                if (file) handleFileSelect(file, fieldName, input);
            });

            // Sélection classique
            input.addEventListener('change', function () {
                if (this.files[0]) {
                    handleFileSelect(this.files[0], fieldName, this);
                }
            });
        });

        // Boutons de suppression
        document.querySelectorAll('.remove-file').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const fieldName = this.dataset.field;
                removeFile(fieldName);
            });
        });
    }

    function handleFileSelect(file, fieldName, input) {
        // Vérification de la taille
        if (file.size > CONFIG.maxFileSize) {
            alert(`Le fichier est trop volumineux. Taille maximale : ${CONFIG.maxFileSize / (1024 * 1024)} Mo`);
            return;
        }

        // Vérification du type
        if (!CONFIG.allowedTypes.includes(file.type)) {
            alert('Format de fichier non autorisé. Formats acceptés : PDF, JPG, PNG');
            return;
        }

        // Stockage du fichier
        uploadedFiles[fieldName] = file;

        // Mise à jour de l'affichage
        const preview = document.getElementById(`preview-${fieldName}`);
        preview.querySelector('.file-name').textContent = file.name;
        preview.style.display = 'flex';

        // Validation
        validateField(input);
    }

    function removeFile(fieldName) {
        delete uploadedFiles[fieldName];

        const input = document.getElementById(fieldName);
        input.value = '';

        const preview = document.getElementById(`preview-${fieldName}`);
        preview.style.display = 'none';

        validateField(input);
    }

    // ===== Gestion de la fratrie =====
    function setupFratrieCounter() {
        const nbFratrie = document.getElementById('nbFratrie');
        const container = document.getElementById('fratrieContainer');
        const addBtn = document.getElementById('addSiblingBtn');

        nbFratrie.addEventListener('change', function () {
            const count = parseInt(this.value) || 0;
            updateFratrieFields(count);
        });
    }

    function updateFratrieFields(count) {
        const container = document.getElementById('fratrieContainer');
        container.innerHTML = '';

        for (let i = 0; i < count; i++) {
            const entry = document.createElement('div');
            entry.className = 'sibling-entry';
            entry.innerHTML = `
                <button type="button" class="remove-sibling" onclick="removeSibling(this)">×</button>
                <div class="form-row">
                    <div class="form-group">
                        <label>Prénom</label>
                        <input type="text" name="fratrie_prenom_${i}" class="form-control" placeholder="Prénom">
                    </div>
                    <div class="form-group">
                        <label>Âge</label>
                        <input type="number" name="fratrie_age_${i}" class="form-control" min="0" max="100">
                    </div>
                    <div class="form-group">
                        <label>Sexe</label>
                        <select name="fratrie_sexe_${i}" class="form-control">
                            <option value="M">Masculin</option>
                            <option value="F">Féminin</option>
                        </select>
                    </div>
                </div>
            `;
            container.appendChild(entry);
        }
    }

    // Fonction globale pour supprimer un frère/sœur
    window.removeSibling = function (btn) {
        const entry = btn.closest('.sibling-entry');
        entry.remove();

        // Mise à jour du compteur
        const nbFratrie = document.getElementById('nbFratrie');
        const currentCount = document.querySelectorAll('.sibling-entry').length;
        nbFratrie.value = currentCount;
    };

    // ===== Gestion des indicatifs "Autre" =====
    function setupIndicatifAutre() {
        const indicatifConfigs = [
            { select: 'indicatifPays', groupe: 'indicatifPaysAutreGroup', input: 'indicatifPaysAutre' },
            { select: 'indicatifPere', input: 'indicatifPereAutre' },
            { select: 'indicatifMere', input: 'indicatifMereAutre' }
        ];

        indicatifConfigs.forEach(config => {
            const selectEl = document.getElementById(config.select);
            const groupeEl = config.groupe ? document.getElementById(config.groupe) : null;
            const inputEl = document.getElementById(config.input);

            if (selectEl && inputEl) {
                selectEl.addEventListener('change', function () {
                    const isAutre = this.value === 'autre';

                    if (groupeEl) {
                        // Nouvelle structure avec groupe
                        groupeEl.classList.toggle('visible', isAutre);
                    } else {
                        // Ancienne structure (père/mère)
                        inputEl.style.display = isAutre ? 'block' : 'none';
                    }

                    if (isAutre) {
                        inputEl.focus();
                    } else {
                        inputEl.value = '';
                    }
                });
            }
        });
    }

    // ===== Gestion des Représentants légaux =====
    function setupRepresentantsLegaux() {
        const autonomeCheckbox = document.getElementById('autonome');
        const representant1Section = document.getElementById('representant1Section');
        const representant2Section = document.getElementById('representant2Section');
        const nomRL1 = document.getElementById('nomRL1');
        const prenomRL1 = document.getElementById('prenomRL1');
        const rl1Required = document.getElementById('rl1Required');

        // Autonome : cache les sections RL
        if (autonomeCheckbox) {
            autonomeCheckbox.addEventListener('change', function () {
                const isAutonome = this.checked;

                representant1Section.style.display = isAutonome ? 'none' : 'block';
                representant2Section.style.display = isAutonome ? 'none' : 'block';

                // Gestion des champs required
                if (isAutonome) {
                    nomRL1.removeAttribute('required');
                    prenomRL1.removeAttribute('required');
                } else {
                    nomRL1.setAttribute('required', '');
                    prenomRL1.setAttribute('required', '');
                }
            });
        }

        // RL2 : affiche les champs quand un type est sélectionné
        document.querySelectorAll('input[name="typeRL2"]').forEach(radio => {
            radio.addEventListener('change', function () {
                const rl2Fields = document.getElementById('rl2Fields');
                rl2Fields.classList.toggle('visible', this.value !== '');
            });
        });

        // Adresse RL1 : affiche les champs si "même adresse" non coché
        const memeAdresseRL1 = document.getElementById('memeAdresseRL1');
        if (memeAdresseRL1) {
            memeAdresseRL1.addEventListener('change', function () {
                const adresseFields = document.getElementById('adresseRL1Fields');
                adresseFields.classList.toggle('visible', !this.checked);
            });
        }

        // Adresse RL2 : affiche les champs si "même adresse" non coché
        const memeAdresseRL2 = document.getElementById('memeAdresseRL2');
        if (memeAdresseRL2) {
            memeAdresseRL2.addEventListener('change', function () {
                const adresseFields = document.getElementById('adresseRL2Fields');
                adresseFields.classList.toggle('visible', !this.checked);
            });
        }

        // Nouveaux indicatifs pour RL1 et RL2
        const indicatifConfigs = [
            { select: 'indicatifRL1', input: 'indicatifRL1Autre' },
            { select: 'indicatifRL2', input: 'indicatifRL2Autre' }
        ];

        indicatifConfigs.forEach(config => {
            const selectEl = document.getElementById(config.select);
            const inputEl = document.getElementById(config.input);

            if (selectEl && inputEl) {
                selectEl.addEventListener('change', function () {
                    const isAutre = this.value === 'autre';
                    inputEl.style.display = isAutre ? 'block' : 'none';
                    if (isAutre) {
                        inputEl.focus();
                    } else {
                        inputEl.value = '';
                    }
                });
            }
        });
    }

    // ===== Date par défaut =====
    function setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('signatureDate').value = today;
    }

    // ===== Récapitulatif =====
    function updateSummary() {
        // Identité
        const prenom = document.getElementById('prenom').value;
        const nom = document.getElementById('nom').value;
        document.getElementById('summary-nom').textContent = `${prenom} ${nom}`;

        const dateNaissance = document.getElementById('dateNaissance').value;
        if (dateNaissance) {
            const date = new Date(dateNaissance);
            document.getElementById('summary-dateNaissance').textContent =
                date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        }

        document.getElementById('summary-email').textContent = document.getElementById('email').value;

        // Téléphone avec indicatif
        const indicatif = document.getElementById('indicatifPays').value;
        const telephone = document.getElementById('telephone').value;
        document.getElementById('summary-telephone').textContent = `${indicatif} ${telephone}`;

        // Bourses
        const coby = document.querySelector('input[name="demandeCoby"]:checked');
        document.getElementById('summary-coby').textContent = coby?.value === 'oui' ? 'Demandée' : 'Non demandée';

        const massa = document.querySelector('input[name="demandeMassa"]:checked');
        document.getElementById('summary-massa').textContent = massa?.value === 'oui' ? 'Demandée' : 'Non demandée';

        const tevmi = document.querySelector('input[name="demandeTevmi"]:checked');
        document.getElementById('summary-tevmi').textContent = tevmi?.value === 'oui' ? 'Demandée' : 'Non demandée';

        // Documents
        const docsContainer = document.getElementById('summary-documents');
        docsContainer.innerHTML = '';

        const docLabels = {
            certificatJudaisme: 'Certificat de judaïsme',
            extraitNaissance: 'Extrait de naissance',
            photoIdentite: 'Photo d\'identité',
            attestationCaf: 'Attestation CAF',
            copiePasseport: 'Copie du passeport',
            visaIsrael: 'Visa Israël'
        };

        for (const [key, label] of Object.entries(docLabels)) {
            const div = document.createElement('div');
            div.className = 'summary-item';
            div.innerHTML = `
                <span class="label">${label}</span>
                <span class="value" style="color: ${uploadedFiles[key] ? 'var(--color-success)' : 'var(--color-gray-400)'}">
                    ${uploadedFiles[key] ? '✓ Fourni' : '— Non fourni'}
                </span>
            `;
            docsContainer.appendChild(div);
        }
    }

    // ===== Soumission du formulaire =====
    async function handleSubmit(e) {
        e.preventDefault();

        // Validation finale
        if (!validateCurrentSection()) {
            showValidationError();
            return;
        }

        // Vérification des checkboxes obligatoires
        const acceptConditions = document.getElementById('acceptConditions');
        const acceptDonnees = document.getElementById('acceptDonnees');

        if (!acceptConditions.checked || !acceptDonnees.checked) {
            alert('Veuillez accepter les conditions et le traitement des données pour valider votre inscription.');
            return;
        }

        // Préparation des données
        const formDataToSend = new FormData(form);

        // Ajout des fichiers
        for (const [fieldName, file] of Object.entries(uploadedFiles)) {
            formDataToSend.set(fieldName, file);
        }

        // Animation du bouton
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Envoi en cours...';

        try {
            // Envoi au serveur
            const response = await fetch(CONFIG.apiEndpoint, {
                method: 'POST',
                body: formDataToSend
            });

            if (response.ok) {
                showSuccess();
            } else {
                throw new Error('Erreur serveur');
            }
        } catch (error) {
            console.error('Erreur:', error);

            // En mode démo (pas de backend), on simule le succès
            // TODO: Supprimer cette simulation quand le backend sera prêt
            console.log('Mode démo: simulation de succès');
            showSuccess();

            // Décommenter pour le mode production :
            // alert('Une erreur est survenue lors de l\'envoi. Veuillez réessayer.');
            // submitBtn.disabled = false;
            // submitBtn.innerHTML = '✓ Valider mon inscription';
        }
    }

    function showSuccess() {
        // Masquer la navigation
        formNavigation.style.display = 'none';

        // Masquer toutes les sections
        sections.forEach(s => s.classList.remove('active'));

        // Afficher le message de succès
        const successSection = document.querySelector('.form-section[data-section="success"]');
        successSection.style.display = 'block';
        successSection.classList.add('active');

        // Mise à jour de la progress bar
        progressLine.style.width = '100%';
        stepIndicators.forEach(indicator => indicator.classList.add('completed'));

        // Scroll vers le haut
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ===== Lancement =====
    document.addEventListener('DOMContentLoaded', init);
})();
