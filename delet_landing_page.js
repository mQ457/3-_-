  // Ждем полной загрузки страницы
    window.addEventListener('load', function() {
        // Удаляем существующие стили если есть
        const oldStyle = document.querySelector('#hide-scrollbar-style');
        if (oldStyle) oldStyle.remove();
        
        // Создаем новый стиль
        const style = document.createElement('style');
        style.id = 'hide-scrollbar-style';
        style.textContent = `
            html, body {
                overflow-y: auto !important;
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
            }
            html::-webkit-scrollbar, 
            body::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                background: transparent !important;
            }
        `;
        document.head.appendChild(style);
    });