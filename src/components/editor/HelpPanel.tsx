export function HelpPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 text-sm leading-relaxed text-muted-foreground">
      <h2 className="text-foreground">Расчёт токарного контура для G-кода</h2>
      <p>
        Контур описывается последовательно в плоскости G18 (ZX). Для чернового цикла вдоль ось описывают в −Z.
        Стойка определяет направление обработки по направлению контура.
      </p>
      <h3 className="text-foreground">Система координат</h3>
      <ul className="list-disc space-y-1 pl-4">
        <li>Z — ось вращения, вправо на графике (+Z к задней бабке).</li>
        <li>X программируется как диаметр; в формулах используется радиус xs = X/2.</li>
        <li>Угол A откладывается от +Z к +X: tan A = Δx / Δz = ΔX / (2 ΔZ).</li>
      </ul>
      <h3 className="text-foreground">Прямая</h3>
      <p>
        Горизонталь (−Z/+Z): X постоянен, вводят Z или L. Вертикаль: Z постоянен, вводят X. Наклон: X и A, или Z и A, или
        полярные L,A. Неполный элемент замыкается пересечением со следующим.
      </p>
      <h3 className="text-foreground">Дуга G2/G3</h3>
      <p>
        Хорда d = |P2−P1|, h = √(R² − (d/2)²), центр C = M ± h n̂. Знак нормали задаёт G2 (по часовой, центр справа от
        хода) или G3. Отрицательный R или большая дуга ({">"}180°) — длинный путь.
      </p>
      <h3 className="text-foreground">Фаска CHF и радиус RND</h3>
      <p>
        B фаски — катет от теоретического угла вдоль каждого смежного элемента (1×45° при 90°). Радиус: t = R / tan(α/2),
        α — внутренний угол контура. Ставятся между двумя прямыми.
      </p>
      <h3 className="text-foreground">DIN 76 / 509</h3>
      <p>
        Незаданные I, K, W, R (DIN 76) и r, t, f (DIN 509) берутся из стандартных таблиц по шагу или диаметру. J=1 —
        канавка начинается с продольного элемента.
      </p>
    
      <div className="mt-3 rounded border border-border/60 bg-bezel/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <p className="mb-1 font-semibold text-phosphor">v5.5</p>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>Реверс пути, зеркало Z (↔Z в «ещё»)</li>
          <li>Шаблоны: 1×45°, канавка, R носа</li>
          <li>Профили G-кода Fanuc / Siemens / Haas</li>
          <li>O-номер, WCS, F / S / T</li>
          <li>Предупреждения: самопересечения (линии+дуги), острые углы</li>
          <li>Экспорт SVG и DXF, печать с эскизом</li>
          <li>Стрелки направления, умный масштаб</li>
          <li>Печать эскиза: Все / Область (образмеривание)</li>
        </ul>
      </div>
    </div>
  );
}
