# Obowiązki dzieci

Add-on Home Assistant dla rodzinnego planera obowiązków, gwiazdek, kuponów i nagród.

Po instalacji panel boczny otwiera ekran dziecięcy. Panel rodzica działa jako osobny moduł pod ścieżką `/parent` i powinien być udostępniany tylko rodzicom.

## Dane i kopie bezpieczeństwa

Wszystkie dane domu są wspólne dla użytkowników Home Assistant i zapisywane przez add-on, nie w pamięci przeglądarki. Aplikacja tworzy automatyczną kopię w trwałym katalogu konfiguracji add-ona (`/config/family-reward-planner/latest-backup.json`).

Rodzic może też wejść w `Panel rodzica` → `Kopia danych`, aby pobrać pełny plik JSON albo przywrócić wcześniej pobraną kopię. Backup zawiera dzieci, obowiązki, postępy, gwiazdki, nagrody, kupony, kalendarz oraz wgrane zdjęcia.
