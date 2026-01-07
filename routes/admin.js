/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KADIMA - Routes API Administration
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * @version     1.0.0
 * @date        07 janvier 2026
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Import database pool
let pool;
function setPool(p) {
    pool = p;
}

// Configuration
const CONFIG = {
    tokenExpiry: 24 * 60 * 60 * 1000, // 24 heures
    rememberExpiry: 30 * 24 * 60 * 60 * 1000, // 30 jours
    saltRounds: 12
};

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE AUTHENTIFICATION
// ═══════════════════════════════════════════════════════════════════════════

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Token manquant' });
    }

    const token = authHeader.substring(7);

    try {
        const result = await pool.query(
            `SELECT s.*, u.id as user_id, u.email, u.nom, u.prenom, u.role, u.actif
             FROM sessions s
             JOIN utilisateurs u ON s.utilisateur_id = u.id
             WHERE s.token = $1 AND s.expire_at > NOW()`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Session expirée' });
        }

        const session = result.rows[0];

        if (!session.actif) {
            return res.status(401).json({ success: false, message: 'Compte désactivé' });
        }

        req.user = {
            id: session.user_id,
            email: session.email,
            nom: session.nom,
            prenom: session.prenom,
            role: session.role
        };
        req.sessionId = session.id;

        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES AUTHENTIFICATION
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/admin/login
router.post('/login', async (req, res) => {
    const { email, password, remember } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email et mot de passe requis'
        });
    }

    try {
        // Vérifier l'utilisateur
        const result = await pool.query(
            'SELECT * FROM utilisateurs WHERE email = $1 AND actif = TRUE',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Identifiants incorrects'
            });
        }

        const user = result.rows[0];

        // Vérifier le mot de passe
        const validPassword = await bcrypt.compare(password, user.mot_de_passe);

        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Identifiants incorrects'
            });
        }

        // Créer le token de session
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = remember ? CONFIG.rememberExpiry : CONFIG.tokenExpiry;
        const expireAt = new Date(Date.now() + expiry);

        // Sauvegarder la session
        await pool.query(
            `INSERT INTO sessions (utilisateur_id, token, adresse_ip, user_agent, expire_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                user.id,
                token,
                req.ip || req.connection.remoteAddress,
                req.headers['user-agent'] || '',
                expireAt
            ]
        );

        // Mettre à jour dernière connexion
        await pool.query(
            'UPDATE utilisateurs SET derniere_connexion = NOW() WHERE id = $1',
            [user.id]
        );

        console.log(`✅ Connexion admin: ${user.email}`);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                nom: user.nom,
                prenom: user.prenom,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// GET /api/admin/verify
router.get('/verify', authMiddleware, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// POST /api/admin/logout
router.post('/logout', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM sessions WHERE id = $1', [req.sessionId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// GET /api/admin/setup - Création admin initial (route temporaire)
router.get('/setup', async (req, res) => {
    try {
        // Vérifier si un admin existe déjà
        const existing = await pool.query('SELECT id FROM utilisateurs LIMIT 1');

        if (existing.rows.length > 0) {
            return res.json({
                success: false,
                message: 'Un utilisateur admin existe déjà'
            });
        }

        // Créer l'admin initial
        const hashedPassword = await bcrypt.hash('b9Dpù#7Ak&cm6wj@', CONFIG.saltRounds);

        await pool.query(
            `INSERT INTO utilisateurs (email, mot_de_passe, nom, prenom, role)
             VALUES ($1, $2, $3, $4, $5)`,
            ['kadima.gestion@gmail.com', hashedPassword, 'Gestion', 'Kadima', 'admin']
        );

        console.log('👤 Utilisateur admin créé via /setup');

        res.json({
            success: true,
            message: 'Utilisateur admin créé: kadima.gestion@gmail.com'
        });

    } catch (error) {
        console.error('Setup error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES STATISTIQUES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/stats
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE s.code = 'RECU') as recu,
                COUNT(*) FILTER (WHERE s.code = 'A_TRAITER') as a_traiter,
                COUNT(*) FILTER (WHERE s.code = 'VALIDE') as valide,
                COUNT(*) FILTER (WHERE s.code = 'EN_COURS') as en_cours,
                COUNT(*) FILTER (WHERE s.code = 'INCOMPLET') as incomplet,
                COUNT(*) FILTER (WHERE s.code = 'REFUSE') as refuse
            FROM inscriptions i
            LEFT JOIN statuts s ON i.statut_id = s.id
        `);

        res.json(result.rows[0] || {});
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES INSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/inscriptions
router.get('/inscriptions', authMiddleware, async (req, res) => {
    try {
        const { statut, session, search, limit = 20, offset = 0 } = req.query;

        let query = `
            SELECT i.*, s.code as statut_code, s.libelle as statut_libelle, s.couleur as statut_couleur
            FROM inscriptions i
            LEFT JOIN statuts s ON i.statut_id = s.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 0;

        if (statut) {
            paramCount++;
            query += ` AND s.code = $${paramCount}`;
            params.push(statut);
        }

        if (session) {
            paramCount++;
            query += ` AND i.session = $${paramCount}`;
            params.push(session);
        }

        if (search) {
            paramCount++;
            query += ` AND (i.nom ILIKE $${paramCount} OR i.prenom ILIKE $${paramCount} OR i.niu ILIKE $${paramCount} OR i.email ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY i.date_inscription DESC`;

        // Count total
        const countResult = await pool.query(
            query.replace('SELECT i.*, s.code as statut_code, s.libelle as statut_libelle, s.couleur as statut_couleur', 'SELECT COUNT(*)'),
            params
        );

        // Add pagination
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        params.push(parseInt(limit));

        paramCount++;
        query += ` OFFSET $${paramCount}`;
        params.push(parseInt(offset));

        const result = await pool.query(query, params);

        res.json({
            success: true,
            total: parseInt(countResult.rows[0].count),
            inscriptions: result.rows
        });

    } catch (error) {
        console.error('Inscriptions error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// GET /api/admin/inscriptions/:niu
router.get('/inscriptions/:niu', authMiddleware, async (req, res) => {
    try {
        const { niu } = req.params;

        const result = await pool.query(`
            SELECT i.*, s.code as statut_code, s.libelle as statut_libelle, s.couleur as statut_couleur
            FROM inscriptions i
            LEFT JOIN statuts s ON i.statut_id = s.id
            WHERE i.niu = $1
        `, [niu]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Inscription non trouvée' });
        }

        const inscription = result.rows[0];

        // Récupérer l'historique des statuts
        const historique = await pool.query(`
            SELECT h.*, u.nom as utilisateur_nom, u.prenom as utilisateur_prenom,
                   sp.libelle as statut_precedent_libelle, sn.libelle as statut_nouveau_libelle
            FROM historique_statuts h
            LEFT JOIN utilisateurs u ON h.utilisateur_id = u.id
            LEFT JOIN statuts sp ON h.statut_precedent = sp.code
            LEFT JOIN statuts sn ON h.statut_nouveau = sn.code
            WHERE h.inscription_id = $1
            ORDER BY h.date_modification DESC
        `, [inscription.id]);

        res.json({
            success: true,
            inscription,
            historique: historique.rows
        });

    } catch (error) {
        console.error('Inscription detail error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// PATCH /api/admin/inscriptions/:niu/statut
router.patch('/inscriptions/:niu/statut', authMiddleware, async (req, res) => {
    try {
        const { niu } = req.params;
        const { statut, raison } = req.body;

        if (!statut) {
            return res.status(400).json({ success: false, message: 'Statut requis' });
        }

        // Récupérer l'inscription et le statut actuel
        const insResult = await pool.query(`
            SELECT i.id, i.statut_id, s.code as statut_code
            FROM inscriptions i
            LEFT JOIN statuts s ON i.statut_id = s.id
            WHERE i.niu = $1
        `, [niu]);

        if (insResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Inscription non trouvée' });
        }

        const inscription = insResult.rows[0];
        const statutPrecedent = inscription.statut_code;

        // Récupérer le nouveau statut
        const statutResult = await pool.query(
            'SELECT id, code FROM statuts WHERE code = $1',
            [statut]
        );

        if (statutResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Statut invalide' });
        }

        const nouveauStatut = statutResult.rows[0];

        // Mettre à jour l'inscription
        await pool.query(
            'UPDATE inscriptions SET statut_id = $1, date_modification = NOW() WHERE id = $2',
            [nouveauStatut.id, inscription.id]
        );

        // Ajouter à l'historique
        await pool.query(`
            INSERT INTO historique_statuts 
            (inscription_id, statut_precedent, statut_nouveau, raison, utilisateur_id, adresse_ip)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            inscription.id,
            statutPrecedent,
            statut,
            raison || null,
            req.user.id,
            req.ip || req.connection.remoteAddress
        ]);

        console.log(`📝 Statut MAJ: ${niu} | ${statutPrecedent} → ${statut} | Par: ${req.user.email}`);

        res.json({
            success: true,
            message: 'Statut mis à jour',
            statutPrecedent,
            statutNouveau: statut
        });

    } catch (error) {
        console.error('Update statut error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES STATUTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/statuts
router.get('/statuts', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM statuts WHERE actif = TRUE ORDER BY ordre'
        );
        res.json({ success: true, statuts: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES UTILISATEURS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/utilisateurs
router.get('/utilisateurs', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, nom, prenom, role, actif, date_creation, derniere_connexion FROM utilisateurs ORDER BY date_creation DESC'
        );
        res.json({ success: true, utilisateurs: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// POST /api/admin/utilisateurs
router.post('/utilisateurs', authMiddleware, async (req, res) => {
    try {
        const { email, password, nom, prenom, role } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
        }

        // Hash du mot de passe
        const hashedPassword = await bcrypt.hash(password, CONFIG.saltRounds);

        const result = await pool.query(
            `INSERT INTO utilisateurs (email, mot_de_passe, nom, prenom, role)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, email, nom, prenom, role`,
            [email.toLowerCase(), hashedPassword, nom, prenom, role || 'admin']
        );

        res.json({ success: true, utilisateur: result.rows[0] });

    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
        }
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// PATCH /api/admin/utilisateurs/:id
router.patch('/utilisateurs/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, password, nom, prenom, role, actif } = req.body;

        const updates = [];
        const params = [];
        let paramCount = 0;

        if (email !== undefined) {
            paramCount++;
            updates.push(`email = $${paramCount}`);
            params.push(email.toLowerCase());
        }

        if (password) {
            paramCount++;
            updates.push(`mot_de_passe = $${paramCount}`);
            params.push(await bcrypt.hash(password, CONFIG.saltRounds));
        }

        if (nom !== undefined) {
            paramCount++;
            updates.push(`nom = $${paramCount}`);
            params.push(nom);
        }

        if (prenom !== undefined) {
            paramCount++;
            updates.push(`prenom = $${paramCount}`);
            params.push(prenom);
        }

        if (role !== undefined) {
            paramCount++;
            updates.push(`role = $${paramCount}`);
            params.push(role);
        }

        if (actif !== undefined) {
            paramCount++;
            updates.push(`actif = $${paramCount}`);
            params.push(actif);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'Rien à mettre à jour' });
        }

        paramCount++;
        params.push(id);

        const result = await pool.query(
            `UPDATE utilisateurs SET ${updates.join(', ')} WHERE id = $${paramCount}
             RETURNING id, email, nom, prenom, role, actif`,
            params
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
        }

        res.json({ success: true, utilisateur: result.rows[0] });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// DELETE /api/admin/utilisateurs/:id
router.delete('/utilisateurs/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Ne pas supprimer son propre compte
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ success: false, message: 'Impossible de supprimer votre propre compte' });
        }

        await pool.query('DELETE FROM utilisateurs WHERE id = $1', [id]);

        res.json({ success: true });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// INITIALISATION ADMIN
// ═══════════════════════════════════════════════════════════════════════════

async function initAdminUser() {
    try {
        // Vérifier si un admin existe
        const result = await pool.query('SELECT id FROM utilisateurs LIMIT 1');

        if (result.rows.length === 0) {
            // Créer l'admin initial
            const hashedPassword = await bcrypt.hash('b9Dpù#7Ak&cm6wj@', CONFIG.saltRounds);

            await pool.query(
                `INSERT INTO utilisateurs (email, mot_de_passe, nom, prenom, role)
                 VALUES ($1, $2, $3, $4, $5)`,
                ['kadima.gestion@gmail.com', hashedPassword, 'Gestion', 'Kadima', 'admin']
            );

            console.log('👤 Utilisateur admin initial créé: kadima.gestion@gmail.com');
        }
    } catch (error) {
        // Table n'existe peut-être pas encore
        console.log('ℹ️  Initialisation admin en attente de la création des tables');
    }
}

module.exports = { router, setPool, initAdminUser };
