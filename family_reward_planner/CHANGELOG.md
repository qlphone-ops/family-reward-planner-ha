# Changelog

## 0.2.0

- Usunięto dzieci wpisane na sztywno w kodzie. Rodzic może teraz dodawać dowolną liczbę dzieci.
- Dodano panel zarządzania dziećmi z wyborem stylu karty: chłopiec albo dziewczynka.
- Dodano historię na karcie dziecka: wykonane/cofnięte obowiązki, przyznane gwiazdki oraz zamówione, zatwierdzone i odebrane nagrody.
- Poprawiono wejście do modułu rodzica przez osobny skrót w Home Assistant z zachowaniem kontroli `parent_users`.
- Uszczelniono sklep nagród dla sytuacji, gdy rodzic usunie wszystkie nagrody.

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
