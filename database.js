// Adicionar este método na classe NyuxDatabase
getJogosPorCategoria(categoria) {
    const stmt = this.db.prepare('SELECT DISTINCT jogo FROM contas WHERE categoria = ? AND status = ? ORDER BY jogo');
    const rows = stmt.all(categoria, 'disponivel');
    return rows.map(row => row.jogo);
}
