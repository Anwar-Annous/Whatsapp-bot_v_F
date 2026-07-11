const db = require('../config/db');

function showLogin(req, res) {
  if (req.session.user) {
    return res.redirect('/');
  }

  res.render('login', { error: '' });
}

function doLogin(req, res) {
  if (!req.body) {
    return res.status(400).render('login', { error: 'Invalid request' });
  }

  const { username, password } = req.body;

  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    (err, user) => {
      if (err) {
        console.error('Login error:', err.message);
        return res.render('login', { error: 'Wrong credentials' });
      }

      if (!user || user.password !== password) {
        return res.render('login', { error: 'Wrong credentials' });
      }

      req.session.user = {
        id: user.id,
        username: user.username,
      };

      res.redirect('/');
    }
  );
}

function doLogout(req, res) {
  req.session.destroy(() => {
    res.redirect('/login');
  });
}

module.exports = {
  showLogin,
  doLogin,
  doLogout,
};
