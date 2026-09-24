# Documentación de la Base de Datos y Diagrama Entidad-Relación (DER)

## Modelo de Datos

La base de datos relacional (PostgreSQL) está estructurada para garantizar integridad referencial, alta velocidad de consulta por casillero (000-999) y escalabilidad sin costo de infraestructura.

```mermaid
erDiagram
    USERS ||--o{ ALBUMS : "creates / owns"
    USERS ||--o{ ALBUM_MEMBERS : "belongs to"
    ALBUMS ||--o{ ALBUM_MEMBERS : "contains members"
    ALBUMS ||--o{ STICKERS : "contains stickers"
    USERS ||--o{ STICKERS : "captured by"

    USERS {
        uuid id PK "Identificador único del usuario"
        string email UK "Correo electrónico (OAuth)"
        string name "Nombre o apodo del usuario"
        string avatar_url "URL de avatar"
        string auth_provider "Google / Facebook / Local"
        datetime created_at "Fecha de registro"
        datetime updated_at "Última actualización"
    }

    ALBUMS {
        uuid id PK "Identificador único del álbum"
        string title "Nombre del álbum (ej: Álbum Familiar)"
        uuid owner_id FK "Usuario propietario del álbum"
        datetime created_at "Fecha de creación"
    }

    ALBUM_MEMBERS {
        uuid id PK "Identificador único de la membresía"
        uuid album_id FK "Álbum al que pertenece"
        uuid user_id FK "Usuario asociado"
        string role "OWNER | ASSOCIATE"
        datetime joined_at "Fecha de incorporación"
    }

    STICKERS {
        uuid id PK "Identificador único de la figurita"
        uuid album_id FK "Álbum en el que está pegada"
        int slot_number "Casillero asignado (0 a 999)"
        string raw_plate "Patente original detectada (ej: AB 123 CD)"
        string image_url "URL de la fotografía capturada"
        uuid uploaded_by_user_id FK "Usuario que tomó la foto"
        datetime captured_at "Fecha y hora de captura"
    }
```

## Índices y Restricciones de Dominio
- **`STICKERS_unique_album_slot`**: Restricción de unicidad compuesta `(album_id, slot_number)`. Evita la duplicación de figuritas en un mismo casillero dentro del mismo álbum.
- **`slot_number`**: Número entero indexado validado entre `0` y `999`.
- **`ALBUM_MEMBERS_unique_album_user`**: Restricción de unicidad compuesta `(album_id, user_id)` para evitar invitaciones duplicadas.
