# Changelog

## 0.1.8

- Usunięto reset prototypu z ekranu głównego i kodu aplikacji.
- Przeniesiono metryczkę dzisiejszego dnia do prawego górnego obszaru ekranu głównego.
- Dodano osobny add-on skrótu `Planner Nagród - Rodzic`, który otwiera panel rodzica z menu Home Assistant.

## 0.1.7

- Dodano changelog widoczny w Home Assistant podczas aktualizacji.
- Doprecyzowano obsługę modułu rodzica pod ścieżką `/parent`.

## 0.1.6

- Wstrzyknięto CSS i JavaScript bezpośrednio do HTML, aby aplikacja działała stabilnie pod Home Assistant Ingress.
- Dodano wersję aplikacji do logu startowego i endpointu `/healthz`.

## 0.1.5

- Uruchamianie backendu przeniesiono do usługi s6 w obrazie Home Assistant.

## 0.1.4

- Dodano obsługę adresów Ingress z prefiksem `/app/...`.

## 0.1.3

- Dodano obsługę prefiksu Ingress dla adresów aplikacji i zasobów statycznych.

## 0.1.2

- Przygotowano strukturę zdalnego repozytorium Home Assistant.

## 0.1.1

- Poprawiono budowanie obrazu dla architektury `aarch64`.

## 0.1.0

- Pierwsza wersja MVP aplikacji.
