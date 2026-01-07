/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KADIMA - Serveur Backend
 * Gestion des inscriptions et bourses - Programme Kadima
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * @version     1.6.0
 * @date        07 janvier 2026 14:00
 * @author      Maxi (Assistant IA) & Sassi
 * 
 * ───────────────────────────────────────────────────────────────────────────
 * HISTORIQUE DES MODIFICATIONS
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * v1.6.0 - 07 janvier 2026 14:00
 *   - Dashboard Admin v1.0
 *   - Authentification admin (bcrypt + sessions)
 *   - API admin : login, stats, inscriptions, utilisateurs
 *   - 11 statuts avec couleurs et workflow
 *   - Historique des changements de statut horodaté
 *   - Tables BDD : historique_statuts, reset_tokens, sessions
 * 
 * v1.5.0 - 06 janvier 2026 17:50
 *   - Formulaire v1.2 : nouvelle section Situation financière
 *   - Dates naissance paramétrables (CONFIG)
 *   - Passeport obligatoire
 *   - Suppression: études secondaires, fratrie
 *   - Niveau hébreu: retrait option "Avancé"
 *   - Liens MASSA/TEVMI plus visibles
 *   - PDF: données médicales exclues (confidentialité)
 *   - 8 étapes au lieu de 7
 * 
 * v1.4.0 - 06 janvier 2026 17:26
 *   - Migration vers PostgreSQL Render (abandon MariaDB IONOS)
 *   - Mise à jour database.js pour pg
 *   - Bourses: CROUS, MASSA, TEVMI, COBY
 * 
 * v1.3.0 - 06 janvier 2026 16:28
 *   - Intégration base de données (tentative MariaDB IONOS)
 *   - Création module database.js (connexion, tables, données par défaut)
 *   - Tables: inscriptions, statuts, bourses, devises, modalités, plateformes
 * 
 * v1.2.0 - 06 janvier 2026 16:07
 *   - Migration de Gmail vers Resend pour l'envoi d'emails
 *   - Ajout fonction getDateIsrael() pour fuseau horaire Israël
 *   - Solution temporaire : envoi email uniquement à l'admin
 *   - Augmentation des timeouts de connexion
 * 
 * v1.1.0 - 05 janvier 2026 14:30
 *   - Ajout logo Kadima dans le PDF
 *   - Remplacement Père/Mère par Représentants légaux 1 et 2
 *   - Option étudiant autonome
 *   - CAF rendu obligatoire avec info-bulle
 *   - Données techniques _meta dans inscription.json
 *   - Suppression sauts de page inutiles dans le PDF
 * 
 * v1.0.0 - 04 janvier 2026 10:00
 *   - Version initiale
 *   - Formulaire multi-étapes
 *   - Génération PDF, NIU, envoi email
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Resend } = require('resend');
const PDFDocument = require('pdfkit');
const { initDatabase, getPool } = require('./database');
const { router: adminRouter, setPool: setAdminPool, initAdminUser } = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

const CONFIG = {
    // Session courante (année de début)
    sessionAnnee: 2026,
    // Email
    email: {
        destinataire: 'kadima.gestion@gmail.com',
        resendApiKey: process.env.RESEND_API_KEY || ''
    }
};

// ===== Middlewares =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Fichier pour stocker le compteur NIU
const niuCounterFile = path.join(__dirname, 'data', 'niu_counter.json');

// ===== Gestion du NIU (Numéro d'Inscription Unique) =====
function getNIUCounter() {
    try {
        if (fs.existsSync(niuCounterFile)) {
            return JSON.parse(fs.readFileSync(niuCounterFile, 'utf8'));
        }
    } catch (e) {
        console.error('Erreur lecture compteur NIU:', e);
    }
    return {};
}

function saveNIUCounter(counter) {
    const dir = path.dirname(niuCounterFile);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(niuCounterFile, JSON.stringify(counter, null, 2), 'utf8');
}

function genererNIU(nom) {
    // Format: AAAA_XXX_NN
    // AAAA = année de session (2026)
    // XXX = 3 premières lettres du nom en majuscules
    // NN = numéro incrémental (01, 02, ...)

    const annee = CONFIG.sessionAnnee.toString();
    const prefixeNom = nom.toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Supprime les accents
        .replace(/[^A-Z]/g, '') // Garde que les lettres
        .substring(0, 3)
        .padEnd(3, 'X'); // Complète avec X si moins de 3 lettres

    const counter = getNIUCounter();
    const key = `${annee}_${prefixeNom}`;

    // Incrémenter le compteur pour cette combinaison
    counter[key] = (counter[key] || 0) + 1;
    saveNIUCounter(counter);

    const numero = counter[key].toString().padStart(3, '0');

    return `${annee}_${prefixeNom}_${numero}`;
}

// ===== Génération PDF du formulaire =====
async function genererPDFFormulaire(data, niu, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(outputPath);

            doc.pipe(stream);

            // Logo en haut à gauche (si disponible)
            const logoPath = path.join(__dirname, 'public', 'images', 'logo-kadima.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 50, 45, { width: 60 });
            }

            // Photo d'identité en haut à droite (si disponible)
            if (data.photoIdentite) {
                const photoPath = path.join(CONFIG.uploadDir, data.photoIdentite);
                if (fs.existsSync(photoPath)) {
                    try {
                        doc.image(photoPath, 480, 45, { width: 70, height: 90, fit: [70, 90] });
                    } catch (e) {
                        console.log('Erreur chargement photo:', e.message);
                    }
                }
            }

            // En-tête (décalé pour laisser la place au logo)
            doc.fontSize(20).font('Helvetica-Bold')
                .text('FORMULAIRE D\'INSCRIPTION', 120, 50, { align: 'center', width: 350 });
            doc.fontSize(14).font('Helvetica')
                .text('Programme Kadima - Yéshiva Yéchouot Yossef', 120, 75, { align: 'center', width: 350 });
            doc.fontSize(12)
                .text(`Session ${CONFIG.sessionAnnee}-${CONFIG.sessionAnnee + 1}`, 120, 95, { align: 'center', width: 350 });

            doc.moveDown(3);
            doc.fontSize(16).font('Helvetica-Bold')
                .fillColor('#1a365d')
                .text(`NIU: ${niu}`, { align: 'center' });
            doc.fillColor('black');

            doc.moveDown(0.5);
            doc.fontSize(10).fillColor('gray')
                .text(`Date d'inscription: ${new Date().toLocaleString('fr-FR')}`, { align: 'center' });
            doc.fillColor('black');

            doc.moveDown(2);

            // Section Identité
            addSection(doc, 'IDENTITÉ DE L\'ÉTUDIANT');
            addField(doc, 'Nom', data.nom);
            addField(doc, 'Prénom', data.prenom);
            addField(doc, 'Date de naissance', formatDate(data.dateNaissance));
            addField(doc, 'Lieu de naissance', data.lieuNaissance);
            addField(doc, 'Email', data.email);
            addField(doc, 'Téléphone', data.telephone);
            addField(doc, 'Adresse', data.adresse);
            addField(doc, 'Nationalité', data.nationalite);
            addField(doc, 'Nationalité israélienne', data.nationaliteIsrael === 'oui' ? 'Oui' : 'Non');
            if (data.nationaliteIsrael === 'oui') {
                addField(doc, 'Date obtention nat. israélienne', data.dateObtentionIsrael);
            }
            addField(doc, 'Num. passeport', data.numPasseport || 'Non renseigné');
            addField(doc, 'Situation familiale', capitalizeFirst(data.situationFamiliale));
            addField(doc, 'Profession', data.profession || 'Non renseignée');

            doc.moveDown(2);

            // Section Famille
            addSection(doc, 'INFORMATIONS FAMILIALES');

            // Vérifier si autonome
            if (data.autonome === 'oui') {
                addField(doc, 'Statut', 'Étudiant autonome');
            } else {
                // Représentant légal 1
                const typeRL1 = data.typeRL1 === 'pere' ? 'Père' :
                    data.typeRL1 === 'mere' ? 'Mère' :
                        data.typeRL1 === 'tuteur' ? 'Tuteur' : 'Non précisé';
                addField(doc, 'Représentant légal 1', `${typeRL1}: ${data.prenomRL1 || ''} ${data.nomRL1 || ''}`);
                addField(doc, 'Tél. RL1', data.telRL1 || 'Non renseigné');
                addField(doc, 'Email RL1', data.emailRL1 || 'Non renseigné');
                addField(doc, 'Profession RL1', data.professionRL1 || 'Non renseignée');
                if (data.memeAdresseRL1 !== 'oui' && data.adresseRL1) {
                    addField(doc, 'Adresse RL1', `${data.adresseRL1}, ${data.codePostalRL1} ${data.villeRL1}, ${data.paysRL1}`);
                }

                // Représentant légal 2 (si renseigné)
                if (data.typeRL2 && data.typeRL2 !== '') {
                    doc.moveDown();
                    const typeRL2 = data.typeRL2 === 'pere' ? 'Père' :
                        data.typeRL2 === 'mere' ? 'Mère' :
                            data.typeRL2 === 'tuteur' ? 'Tuteur' : 'Non précisé';
                    addField(doc, 'Représentant légal 2', `${typeRL2}: ${data.prenomRL2 || ''} ${data.nomRL2 || ''}`);
                    addField(doc, 'Tél. RL2', data.telRL2 || 'Non renseigné');
                    addField(doc, 'Email RL2', data.emailRL2 || 'Non renseigné');
                    addField(doc, 'Profession RL2', data.professionRL2 || 'Non renseignée');
                    if (data.memeAdresseRL2 !== 'oui' && data.adresseRL2) {
                        addField(doc, 'Adresse RL2', `${data.adresseRL2}, ${data.codePostalRL2} ${data.villeRL2}, ${data.paysRL2}`);
                    }
                }
            }

            doc.moveDown();
            addField(doc, 'Contact en Isräel', data.contactIsrael || 'Non renseigné');

            doc.moveDown(2);

            // Section Situation financière
            addSection(doc, 'SITUATION FINANCIÈRE');
            addField(doc, 'Revenus mensuels foyer', data.revenusMensuels ? `${data.revenusMensuels} ${formatDevise(data.deviseRevenus)}` : 'Non renseigné');
            addField(doc, 'Allocations CAF/APL', data.allocationsCaf ? `${data.allocationsCaf} EUR` : 'Non renseigné');
            addField(doc, 'Loyer mensuel', data.loyerMensuel ? `${data.loyerMensuel} EUR` : 'Non renseigné');
            addField(doc, 'Personnes au foyer', data.nbPersonnesFoyer || 'Non renseigné');
            addField(doc, 'Enfants à charge', data.nbEnfantsCharge || '0');
            addField(doc, 'Quotient familial CAF', data.quotientFamilial || 'Non renseigné');
            doc.moveDown();
            addField(doc, 'Coût scolarité précédente', data.coutScolaritePrecedente ? `${data.coutScolaritePrecedente} ${formatDevise(data.deviseScolarite)}/mois` : 'Non renseigné');
            addField(doc, 'Participation possible Kadima', data.participationPossible ? `${data.participationPossible} ${formatDevise(data.deviseParticipation)}/mois` : 'Non renseigné');
            addField(doc, 'Bourse CROUS', data.bourseCrous === 'oui' ? `Oui - Échelon ${data.crousEchelon || '?'} (${data.crousMontant || '?'}€/mois)` : 'Non');
            addField(doc, 'Autres bourses', data.autresBourses || 'Aucune');
            addField(doc, 'Étudiant travaille', data.etudiantTravaille === 'oui' ? `Oui - ${data.travailType || '?'} (${data.travailRevenu || '?'}€/mois)` : 'Non');

            doc.moveDown();

            // Section Parcours
            addSection(doc, 'PARCOURS SCOLAIRE');
            addField(doc, 'Baccalauréat', formatBaccalaureat(data.baccalaureat));
            addField(doc, 'École/Université', data.nomEcole || 'Non renseigné');
            addField(doc, 'Dernier diplôme obtenu', data.diplomeObtenu || 'Non renseigné');
            doc.moveDown();
            addField(doc, 'Hébreu oral', getNiveauLabel(data.hebreuOral));
            addField(doc, 'Hébreu lecture', getNiveauLabel(data.hebreuLecture));
            addField(doc, 'Hébreu écrit', getNiveauLabel(data.hebreuEcrit));
            doc.moveDown();
            addField(doc, 'Mouvement de jeunesse', data.mouvementJeunesse || 'Aucun');
            addField(doc, 'Sports', data.sports || 'Aucun');
            addField(doc, 'Musique', data.musique || 'Aucun');
            addField(doc, 'Comment avez-vous connu Kadima ?', formatCommentConnu(data.commentConnuKadima));
            addField(doc, 'Projets après Kadima', data.projetsApres || 'Non renseigné');
            addField(doc, 'Psychométriques', data.psychometriques === 'oui' ? 'Intéressé' : 'Non');

            doc.moveDown(2);

            // Section Bourses
            addSection(doc, 'DEMANDES DE BOURSES');
            addField(doc, 'Bourse COBY', data.demandeCoby === 'oui' ? 'Demandée' : 'Non demandée');
            if (data.demandeCoby === 'oui') {
                addField(doc, 'Motivation COBY', data.cobyMotivation || 'Non renseignée');
            }
            doc.moveDown();
            addField(doc, 'Bourse MASSA', data.demandeMassa === 'oui' ? 'Demandée' : 'Non demandée');
            if (data.demandeMassa === 'oui') {
                addField(doc, 'N° dossier MASSA', data.massaNumero || 'Non renseigné');
                addField(doc, 'Statut MASSA', data.massaStatut || 'En cours');
                addField(doc, 'Commentaire MASSA', data.massaCommentaire || '');
            }
            doc.moveDown();
            addField(doc, 'Bourse TEVMI', data.demandeTevmi === 'oui' ? 'Demandée' : 'Non demandée');
            if (data.demandeTevmi === 'oui') {
                addField(doc, 'N° dossier TEVMI', data.tevmiNumero || 'Non renseigné');
                addField(doc, 'Statut TEVMI', data.tevmiStatut || 'En cours');
                addField(doc, 'Commentaire TEVMI', data.tevmiCommentaire || '');
            }

            doc.moveDown(2);

            // Section Médical (données confidentielles - non incluses dans le PDF)
            addSection(doc, 'INFORMATIONS MÉDICALES');
            doc.fontSize(10).font('Helvetica-Oblique')
                .fillColor('#666666')
                .text('Les informations médicales sont strictement confidentielles.')
                .text('Elles sont enregistrées séparément et ne figurent pas dans ce document.')
                .text('Merci de contacter l\'administration pour toute question.')
                .moveDown();
            doc.fillColor('black').font('Helvetica');

            doc.moveDown(2);

            // Signature
            addSection(doc, 'VALIDATION');
            addField(doc, 'Signataire', data.signatureNom);
            addField(doc, 'Date de signature', formatDate(data.signatureDate));

            doc.moveDown(2);
            doc.fontSize(8).fillColor('gray')
                .text('Document généré automatiquement par le système d\'inscription Kadima.', { align: 'center' })
                .text(`Référence: ${niu}`, { align: 'center' });

            doc.end();

            stream.on('finish', () => resolve(outputPath));
            stream.on('error', reject);

        } catch (error) {
            reject(error);
        }
    });
}

function addSection(doc, title) {
    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text(title);
    doc.moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .strokeColor('#d69e2e')
        .lineWidth(2)
        .stroke();
    doc.fillColor('black').font('Helvetica');
    doc.moveDown(0.5);
}

function addField(doc, label, value) {
    doc.fontSize(10)
        .font('Helvetica-Bold').text(`${label}: `, { continued: true })
        .font('Helvetica').text(value || 'Non renseigné');
}

function formatDate(dateStr) {
    if (!dateStr) return 'Non renseignée';
    try {
        return new Date(dateStr).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

function getNiveauLabel(niveau) {
    const niveaux = ['Aucun', 'Débutant', 'Intermédiaire', 'Avancé', 'Courant'];
    return niveaux[parseInt(niveau) || 0];
}

// Capitaliser la première lettre
function capitalizeFirst(str) {
    if (!str) return 'Non renseigné';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Formater devise sur 3 caractères
function formatDevise(devise) {
    if (!devise) return 'EUR';
    const devises = {
        '€': 'EUR', 'euro': 'EUR', 'euros': 'EUR', 'eur': 'EUR',
        '$': 'USD', 'dollar': 'USD', 'dollars': 'USD', 'usd': 'USD',
        '₪': 'ILS', 'shekel': 'ILS', 'shekels': 'ILS', 'ils': 'ILS', 'nis': 'ILS'
    };
    return devises[devise.toLowerCase()] || devise.toUpperCase().substring(0, 3);
}

// Formater baccalauréat
function formatBaccalaureat(bac) {
    if (!bac) return 'Non renseigné';
    const formats = {
        'en_cours': 'En cours',
        'obtenu': 'Obtenu',
        'non_obtenu': 'Non obtenu',
        'equivalence': 'Équivalence'
    };
    return formats[bac.toLowerCase()] || capitalizeFirst(bac);
}

// Formater comment connu Kadima
function formatCommentConnu(value) {
    if (!value) return 'Non renseigné';
    const labels = {
        'bouche_a_oreille': 'Bouche à oreille',
        'reseaux_sociaux': 'Réseaux sociaux',
        'site_internet': 'Site internet',
        'ancien_etudiant': 'Ancien étudiant',
        'famille': 'Famille',
        'ami': 'Ami',
        'rabbin': 'Rabbin',
        'autre': 'Autre'
    };
    return labels[value.toLowerCase()] || capitalizeFirst(value);
}

// ===== Fonction Date Israël =====
function getDateIsrael() {
    return new Date().toLocaleString('fr-FR', {
        timeZone: 'Asia/Jerusalem',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// ===== Configuration Email Resend =====
let resend = null;
if (CONFIG.email.resendApiKey) {
    resend = new Resend(CONFIG.email.resendApiKey);
    console.log('📧 Envoi d\'emails activé (Resend)');
} else {
    console.log('⚠️  Envoi d\'emails désactivé (variable RESEND_API_KEY non configurée)');
}

// Fonction d'envoi d'email avec PDF (Resend)
async function envoyerEmailInscription(data, niu, pdfPath) {
    if (!resend) {
        console.log('📧 Email non envoyé (Resend non configuré)');
        return false;
    }

    const emailContent = `Bonjour,

Nous vous remercions pour votre demande d'inscription au Programme Kadima.

📋 Voici votre Numéro d'Inscription Unique (NIU) : ${niu}
Ce numéro est votre référence pour tous les échanges avec l'administration.
Veuillez le conserver précieusement et le mentionner dans toute correspondance.

Vous trouverez en pièce jointe le récapitulatif de votre demande.

Elle sera traitée dans les meilleurs délais. Vous recevrez une réponse complète sous 24 à 48 heures (hors jours fériés et Chabbat).

Bien cordialement,

Service gestion – Programme Kadima
📧 kadima.gestion@gmail.com
`;

    try {
        // Lire le PDF en base64 si disponible
        let attachments = [];
        if (pdfPath && fs.existsSync(pdfPath)) {
            const pdfContent = fs.readFileSync(pdfPath);
            attachments.push({
                filename: `Inscription_${niu}.pdf`,
                content: pdfContent
            });
        }

        // SOLUTION TEMPORAIRE: Envoyer uniquement à l'admin (domaine Resend non vérifié)
        // L'email contient toutes les infos de l'étudiant pour que l'admin puisse le contacter
        const emailAdmin = `📥 NOUVELLE INSCRIPTION KADIMA

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 NIU: ${niu}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 ÉTUDIANT:
   Nom: ${data.nom} ${data.prenom}
   Email: ${data.email}
   Téléphone: ${data.telephone || 'Non renseigné'}

📅 Date d'inscription: ${getDateIsrael()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ NOTE: L'étudiant n'a PAS reçu d'email automatique.
Veuillez le contacter manuellement pour confirmer sa réception.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Contenu du message type à envoyer à l'étudiant:

${emailContent}
`;

        await resend.emails.send({
            from: 'Kadima <onboarding@resend.dev>',
            to: CONFIG.email.destinataire, // Admin uniquement
            subject: `[${niu}] Nouvelle inscription: ${data.nom} ${data.prenom}`,
            text: emailAdmin,
            attachments: attachments
        });

        console.log(`📧 Email envoyé à l'admin ${CONFIG.email.destinataire}`);
        console.log(`⚠️  L'étudiant ${data.email} n'a PAS reçu d'email (domaine non vérifié)`);
        return true;
    } catch (error) {
        console.error('❌ Erreur envoi email Resend:', error.message);
        return false;
    }
}

// ===== Middleware =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Dossier pour les uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuration Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Le dossier sera créé après avoir le NIU
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const name = file.fieldname + '_' + Date.now() + ext;
        cb(null, name);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Type de fichier non autorisé'), false);
        }
    }
});

// ===== Routes =====

app.get('/', (req, res) => {
    res.redirect('/inscription.html');
});

// API: Réception des inscriptions
app.post('/api/inscription', upload.fields([
    { name: 'certificatJudaisme', maxCount: 1 },
    { name: 'extraitNaissance', maxCount: 1 },
    { name: 'photoIdentite', maxCount: 1 },
    { name: 'attestationCaf', maxCount: 1 },
    { name: 'copiePasseport', maxCount: 1 },
    { name: 'visaIsrael', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('\n========================================');
        console.log('📥 NOUVELLE INSCRIPTION REÇUE');
        console.log('========================================');
        console.log('Date:', getDateIsrael());

        const data = req.body;

        // Générer le NIU
        const niu = genererNIU(data.nom);
        console.log(`\n🔢 NIU généré: ${niu}`);

        // Créer le dossier avec le NIU
        const dossierInscription = path.join(uploadsDir, niu);
        if (!fs.existsSync(dossierInscription)) {
            fs.mkdirSync(dossierInscription, { recursive: true });
        }

        // Déplacer les fichiers uploadés
        if (req.files) {
            for (const [fieldName, files] of Object.entries(req.files)) {
                for (const file of files) {
                    const oldPath = file.path;
                    const newPath = path.join(dossierInscription, file.filename);
                    fs.renameSync(oldPath, newPath);
                    file.path = newPath;
                    console.log(`   📄 ${fieldName}: ${file.originalname}`);
                }
            }
        }

        // Sauvegarder les données JSON
        const inscriptionData = {
            niu: niu,
            ...data,
            dateInscription: new Date().toISOString(),
            fichiers: req.files ? Object.fromEntries(
                Object.entries(req.files).map(([k, v]) => [k, v[0].filename])
            ) : {},
            // Données techniques (pour debug/sécurité - non incluses dans le PDF)
            _meta: {
                ip: req.ip || req.connection.remoteAddress,
                ipForwarded: req.headers['x-forwarded-for'] || null,
                userAgent: req.headers['user-agent'] || null,
                acceptLanguage: req.headers['accept-language'] || null,
                referer: req.headers['referer'] || null,
                timestampUTC: new Date().toISOString(),
                serverVersion: '1.1.0'
            }
        };

        const jsonPath = path.join(dossierInscription, 'inscription.json');
        fs.writeFileSync(jsonPath, JSON.stringify(inscriptionData, null, 2), 'utf8');
        console.log(`💾 Données sauvegardées: ${jsonPath}`);

        // Générer le PDF
        const pdfPath = path.join(dossierInscription, `Inscription_${niu}.pdf`);
        await genererPDFFormulaire(data, niu, pdfPath);
        console.log(`📄 PDF généré: ${pdfPath}`);

        // Envoyer l'email
        await envoyerEmailInscription(data, niu, pdfPath);

        console.log('\n✅ Inscription traitée avec succès!');
        console.log('========================================\n');

        res.json({
            success: true,
            message: 'Inscription enregistrée avec succès',
            niu: niu
        });

    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du traitement de l\'inscription',
            error: error.message
        });
    }
});

// API: Liste des inscriptions
app.get('/api/inscriptions', (req, res) => {
    try {
        const inscriptions = [];

        if (fs.existsSync(uploadsDir)) {
            const folders = fs.readdirSync(uploadsDir);

            folders.forEach(folder => {
                const jsonPath = path.join(uploadsDir, folder, 'inscription.json');
                if (fs.existsSync(jsonPath)) {
                    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                    inscriptions.push({
                        niu: data.niu,
                        nom: data.nom,
                        prenom: data.prenom,
                        email: data.email,
                        dateInscription: data.dateInscription,
                        bourses: {
                            coby: data.demandeCoby === 'oui',
                            massa: data.demandeMassa === 'oui',
                            tevmi: data.demandeTevmi === 'oui'
                        }
                    });
                }
            });
        }

        res.json({
            success: true,
            count: inscriptions.length,
            inscriptions: inscriptions.sort((a, b) =>
                new Date(b.dateInscription) - new Date(a.dateInscription)
            )
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Gestion des erreurs
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Démarrage
async function startServer() {
    // Initialiser la base de données
    const dbConnected = await initDatabase();

    // Configurer les routes admin avec le pool de connexion
    if (dbConnected) {
        const pool = getPool();
        setAdminPool(pool);

        // Monter les routes admin
        app.use('/api/admin', adminRouter);

        // Initialiser l'utilisateur admin
        await initAdminUser();

        console.log('🔐 Routes admin activées: /api/admin/*');
    }

    app.listen(PORT, () => {
        console.log('\n🚀 ============================================');
        console.log('   KADIMA - Serveur de gestion des inscriptions');
        console.log('   ============================================');
        console.log(`\n   📍 URL: http://localhost:${PORT}`);
        console.log(`   📝 Formulaire: http://localhost:${PORT}/inscription.html`);
        console.log(`   🔐 Admin: http://localhost:${PORT}/admin/`);
        console.log(`   📁 Uploads: ${uploadsDir}`);
        console.log(`   📅 Session: ${CONFIG.sessionAnnee}-${CONFIG.sessionAnnee + 1}`);
        if (dbConnected) {
            console.log('   🗄️  Base de données: PostgreSQL Render connectée');
        } else {
            console.log('   ⚠️  Base de données: Mode fichiers JSON (fallback)');
        }
        console.log('\n   En attente d\'inscriptions...\n');
    });
}

// Lancer le serveur
startServer().catch(console.error);
