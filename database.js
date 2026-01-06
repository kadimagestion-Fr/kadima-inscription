/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KADIMA - Configuration Base de Données PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * @version     1.1.0
 * @date        06 janvier 2026 16:56
 * @author      Maxi (Assistant IA) & Sassi
 * 
 * ───────────────────────────────────────────────────────────────────────────
 * HISTORIQUE DES MODIFICATIONS
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * v1.1.0 - 06 janvier 2026 16:56
 *   - Migration vers PostgreSQL (Render)
 *   - Adaptation des requêtes SQL
 * 
 * v1.0.0 - 06 janvier 2026 16:18
 *   - Configuration initiale MariaDB IONOS (abandonnée)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { Pool } = require('pg');

// Configuration de connexion PostgreSQL Render
// Utilise DATABASE_URL si disponible (interne Render), sinon variables individuelles
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

/**
 * Initialise la connexion à la base de données
 */
async function initDatabase() {
    try {
        // Test de connexion
        const client = await pool.connect();
        console.log('🗄️  Base de données PostgreSQL connectée');
        client.release();

        // Créer les tables si elles n'existent pas
        await createTables();

        return true;
    } catch (error) {
        console.error('❌ Erreur connexion base de données:', error.message);
        console.log('⚠️  Le système fonctionnera en mode fichiers JSON');
        return false;
    }
}

/**
 * Crée les tables nécessaires
 */
async function createTables() {
    const queries = [
        // Table des inscriptions
        `CREATE TABLE IF NOT EXISTS inscriptions (
            id SERIAL PRIMARY KEY,
            niu VARCHAR(20) UNIQUE NOT NULL,
            session VARCHAR(20) NOT NULL,
            statut_id INT DEFAULT 1,
            date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            -- Identité étudiant
            nom VARCHAR(100) NOT NULL,
            prenom VARCHAR(100) NOT NULL,
            date_naissance DATE,
            lieu_naissance VARCHAR(100),
            nationalite VARCHAR(50),
            email VARCHAR(255) NOT NULL,
            telephone VARCHAR(20),
            adresse TEXT,
            code_postal VARCHAR(10),
            ville VARCHAR(100),
            pays VARCHAR(50),
            passeport VARCHAR(50),
            
            -- Données complètes (JSON pour flexibilité)
            donnees_completes JSONB,
            donnees_meta JSONB,
            
            -- Finances
            revenus_mensuels DECIMAL(10,2),
            devise_revenus VARCHAR(3) DEFAULT 'EUR',
            allocations_caf DECIMAL(10,2),
            loyer_mensuel DECIMAL(10,2),
            participation_possible DECIMAL(10,2),
            devise_participation VARCHAR(3) DEFAULT 'EUR',
            bourse_demandee DECIMAL(10,2),
            bourse_proposee DECIMAL(10,2),
            bourse_validee DECIMAL(10,2),
            
            -- Documents
            documents JSONB,
            pdf_path VARCHAR(255)
        )`,

        // Index pour inscriptions
        `CREATE INDEX IF NOT EXISTS idx_inscriptions_niu ON inscriptions(niu)`,
        `CREATE INDEX IF NOT EXISTS idx_inscriptions_session ON inscriptions(session)`,
        `CREATE INDEX IF NOT EXISTS idx_inscriptions_statut ON inscriptions(statut_id)`,
        `CREATE INDEX IF NOT EXISTS idx_inscriptions_nom ON inscriptions(nom)`,

        // Table des statuts
        `CREATE TABLE IF NOT EXISTS statuts (
            id SERIAL PRIMARY KEY,
            code VARCHAR(20) UNIQUE NOT NULL,
            libelle VARCHAR(100) NOT NULL,
            couleur VARCHAR(7) DEFAULT '#6c757d',
            ordre INT DEFAULT 0,
            actif BOOLEAN DEFAULT TRUE,
            actions JSONB
        )`,

        // Table des bourses
        `CREATE TABLE IF NOT EXISTS bourses (
            id SERIAL PRIMARY KEY,
            nom VARCHAR(100) NOT NULL,
            lien VARCHAR(500),
            montant_min DECIMAL(10,2),
            montant_max DECIMAL(10,2),
            date_debut DATE,
            date_fin DATE,
            actif BOOLEAN DEFAULT TRUE
        )`,

        // Table des devises
        `CREATE TABLE IF NOT EXISTS devises (
            id SERIAL PRIMARY KEY,
            code VARCHAR(3) UNIQUE NOT NULL,
            symbole VARCHAR(5),
            libelle VARCHAR(50),
            taux_eur DECIMAL(10,6) DEFAULT 1.000000,
            date_maj TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        // Table des modalités de paiement
        `CREATE TABLE IF NOT EXISTS modalites_paiement (
            id SERIAL PRIMARY KEY,
            code VARCHAR(20) UNIQUE NOT NULL,
            libelle VARCHAR(100) NOT NULL,
            actif BOOLEAN DEFAULT TRUE
        )`,

        // Table des plateformes de paiement
        `CREATE TABLE IF NOT EXISTS plateformes (
            id SERIAL PRIMARY KEY,
            code VARCHAR(20) UNIQUE NOT NULL,
            libelle VARCHAR(100) NOT NULL,
            lien VARCHAR(500),
            actif BOOLEAN DEFAULT TRUE
        )`,

        // Table des utilisateurs (admin)
        `CREATE TABLE IF NOT EXISTS utilisateurs (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            mot_de_passe VARCHAR(255) NOT NULL,
            nom VARCHAR(100),
            role VARCHAR(20) DEFAULT 'admin',
            actif BOOLEAN DEFAULT TRUE,
            date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    for (const query of queries) {
        await pool.query(query);
    }

    // Insérer les données par défaut
    await insertDefaultData();

    console.log('📊 Tables créées/vérifiées avec succès');
}

/**
 * Insère les données par défaut
 */
async function insertDefaultData() {
    // Statuts par défaut
    const statuts = [
        { code: 'RECU', libelle: 'Reçu', couleur: '#17a2b8', ordre: 1 },
        { code: 'A_TRAITER', libelle: 'À traiter', couleur: '#007bff', ordre: 2 },
        { code: 'INCOMPLET', libelle: 'Dossier incomplet', couleur: '#ffc107', ordre: 3 },
        { code: 'EN_ATTENTE', libelle: 'En attente', couleur: '#6c757d', ordre: 4 },
        { code: 'VALIDE', libelle: 'Validée', couleur: '#28a745', ordre: 5 },
        { code: 'REFUSE', libelle: 'Refusée', couleur: '#dc3545', ordre: 6 },
        { code: 'AUTRE', libelle: 'Autres', couleur: '#6c757d', ordre: 7 },
        { code: 'ABANDONNE', libelle: 'Abandonné', couleur: '#6c757d', ordre: 8 },
        { code: 'TERMINE', libelle: 'Terminé', couleur: '#28a745', ordre: 9 },
        { code: 'ARCHIVE', libelle: 'Archivé', couleur: '#343a40', ordre: 10 }
    ];

    for (const statut of statuts) {
        await pool.query(
            `INSERT INTO statuts (code, libelle, couleur, ordre) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (code) DO NOTHING`,
            [statut.code, statut.libelle, statut.couleur, statut.ordre]
        );
    }

    // Devises par défaut
    const devises = [
        { code: 'EUR', symbole: '€', libelle: 'Euro', taux: 1.0 },
        { code: 'USD', symbole: '$', libelle: 'Dollar américain', taux: 0.92 },
        { code: 'CAD', symbole: 'C$', libelle: 'Dollar canadien', taux: 0.68 },
        { code: 'ILS', symbole: '₪', libelle: 'Shekel', taux: 0.25 }
    ];

    for (const devise of devises) {
        await pool.query(
            `INSERT INTO devises (code, symbole, libelle, taux_eur) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (code) DO NOTHING`,
            [devise.code, devise.symbole, devise.libelle, devise.taux]
        );
    }

    // Bourses par défaut
    const bourses = [
        { nom: 'Bourse CROUS', lien: 'https://www.messervices.etudiant.gouv.fr', min: 0, max: 6000 },
        { nom: 'Bourse MASSA', lien: 'https://www.masaisrael.org', min: 0, max: 10000 },
        { nom: 'Bourse TEVMI', lien: 'https://form.jotform.com/253134471672456', min: 0, max: 5000 },
        { nom: 'Bourse COBY', lien: null, min: 0, max: 5000 }
    ];

    for (const bourse of bourses) {
        await pool.query(
            `INSERT INTO bourses (nom, lien, montant_min, montant_max) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT DO NOTHING`,
            [bourse.nom, bourse.lien, bourse.min, bourse.max]
        );
    }

    // Modalités de paiement par défaut
    const modalites = [
        { code: 'ESPECES', libelle: 'Espèces' },
        { code: 'CB', libelle: 'Carte bancaire' },
        { code: 'VIREMENT', libelle: 'Virement bancaire' }
    ];

    for (const modalite of modalites) {
        await pool.query(
            `INSERT INTO modalites_paiement (code, libelle) 
             VALUES ($1, $2) 
             ON CONFLICT (code) DO NOTHING`,
            [modalite.code, modalite.libelle]
        );
    }

    // Plateformes par défaut
    const plateformes = [
        { code: 'NEDARIM', libelle: 'Nedarim' },
        { code: 'PAYPAL', libelle: 'PayPal' },
        { code: 'ETHICAPAY', libelle: 'Ethicapay' }
    ];

    for (const plateforme of plateformes) {
        await pool.query(
            `INSERT INTO plateformes (code, libelle) 
             VALUES ($1, $2) 
             ON CONFLICT (code) DO NOTHING`,
            [plateforme.code, plateforme.libelle]
        );
    }
}

/**
 * Obtient le pool de connexions
 */
function getPool() {
    return pool;
}

/**
 * Ferme la connexion
 */
async function closeDatabase() {
    await pool.end();
    console.log('🗄️  Connexion base de données fermée');
}

module.exports = {
    initDatabase,
    getPool,
    closeDatabase
};
