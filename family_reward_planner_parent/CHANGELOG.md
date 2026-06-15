# Changelog

## 0.1.4

- Naprawiono otwieranie panelu rodzica pod Home Assistant Ingress, gdy Supervisor przekazuje do skrótu ścieżkę `/` albo `//`.
- Skrót rodzica wylicza adres głównej aplikacji także z nagłówka `X-Ingress-Path`, dzięki czemu nie powinien restartować się na błędzie `ERR_INVALID_URL`.

## 0.1.3

- Zmieniono nazwę dodatku w sklepie Home Assistant na `Obowiązki dzieci (Panel rodzica)`.
- Zmieniono tytuł w sidebarze Home Assistant na `Panel rodzica`.

## 0.1.2

- Zmieniono otwieranie panelu rodzica tak, aby skrót w menu Home Assistant przełączał całe okno do głównej aplikacji, zamiast ładować Home Assistant wewnątrz Home Assistant.

## 0.1.1

- Poprawiono obsługę ścieżki `//` zwracanej przez Home Assistant Ingress.
- Skrót rodzica przekierowuje teraz do głównej aplikacji z parametrem `?module=parent`.

## 0.1.0

- Pierwsza wersja skrótu do panelu rodzica.
