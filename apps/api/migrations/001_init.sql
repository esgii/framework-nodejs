-- 001_init.sql : le schéma de départ du carnet de voyage.
-- Tout est dans une transaction : si une ligne échoue, rien n'est créé à moitié.
BEGIN;

-- Les comptes. L'email est unique : deux comptes ne peuvent pas partager le même.
CREATE TABLE users
(
    id            serial PRIMARY KEY,
    email         text        NOT NULL UNIQUE,
    -- Jamais le mot de passe lui-même : seulement son hash bcrypt.
    password_hash text        NOT NULL,
    display_name  text        NOT NULL,
    -- Liste blanche des rôles : la base refuse toute autre valeur.
    role          text        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    -- Chemin du fichier dans uploads/, null tant qu'il n'y a pas d'avatar.
    avatar_path   text        NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Les carnets de voyage, écrits par un utilisateur.
CREATE TABLE journeys
(
    id         serial PRIMARY KEY,
    -- Sans ON DELETE : on ne peut pas supprimer un compte qui a encore des carnets (RESTRICT par défaut).
    author_id  integer     NOT NULL REFERENCES users (id),
    title      text        NOT NULL,
    summary    text        NOT NULL DEFAULT '',
    cover_path text        NULL,
    visibility text        NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Les étapes d'un carnet. Supprimer le carnet supprime ses étapes (ON DELETE CASCADE).
CREATE TABLE steps
(
    id          serial PRIMARY KEY,
    journey_id  integer NOT NULL REFERENCES journeys (id) ON DELETE CASCADE,
    title       text    NOT NULL,
    description text    NOT NULL DEFAULT '',
    photo_path  text    NULL,
    -- L'ordre d'affichage des étapes dans le carnet.
    position    integer NOT NULL,
    -- Le jour de l'étape, sans heure.
    date        date    NULL
);

-- Les commentaires. deleted_at rempli = commentaire supprimé (suppression douce) :
-- la ligne reste en base, mais l'API ne l'affiche plus.
-- Supprimer le carnet supprime vraiment ses commentaires (ON DELETE CASCADE).
CREATE TABLE comments
(
    id         serial PRIMARY KEY,
    journey_id integer     NOT NULL REFERENCES journeys (id) ON DELETE CASCADE,
    author_id  integer     NOT NULL REFERENCES users (id),
    content    text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz NULL
);

-- Les tags (exigés par la v2). Un nom n'existe qu'une fois.
CREATE TABLE tags
(
    id   serial PRIMARY KEY,
    name text NOT NULL UNIQUE
);

-- La table de liaison : un carnet a plusieurs tags, un tag est sur plusieurs carnets.
-- La clé primaire composite empêche de mettre deux fois le même tag sur un carnet.
-- Supprimer un carnet ou un tag supprime seulement les liens, jamais l'autre côté.
CREATE TABLE journey_tags
(
    journey_id integer NOT NULL REFERENCES journeys (id) ON DELETE CASCADE,
    tag_id     integer NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (journey_id, tag_id)
);

COMMIT;